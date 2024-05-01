import { Vdaf } from "@divviup/vdaf";
import type { XofConstructor } from "@divviup/xof";
import {
  fill,
  arr,
  concat,
  integerToOctetStringLE,
  chunk,
} from "@divviup/common";
import { Field } from "@divviup/field";
import type { Flp } from "./flp.js";
import { Buffer } from "buffer";

type AggregationParameter = null;
type PublicShare = { jointRandParts: Buffer[] };
type InputShare = {
  measurementShare: bigint[];
  proofsShare: bigint[];
  wireMeasurementShare: Buffer;
  wireProofShare: Buffer;
  blind: Buffer;
};
type OutputShare = bigint[];
type AggregatorShare = bigint[];
type PreparationState = {
  outputShare: OutputShare;
  correctedJointRandSeed: Buffer;
};
type PreparationShare = {
  verifiersShare: bigint[];
  jointRandomnessPart: Buffer;
};
type PreparationMessage = { jointRand: Buffer };
type Share = InputShare & { jointRandPart: Buffer };

enum Usage {
  MeasurementShare = 1,
  ProofShare = 2,
  JointRandomness = 3,
  ProveRandomness = 4,
  QueryRandomness = 5,
  JointRandSeed = 6,
  JointRandPart = 7,
}

export class Prio3<Measurement, AggregateResult> extends Vdaf<
  Measurement,
  AggregationParameter,
  PublicShare,
  InputShare,
  OutputShare,
  AggregatorShare,
  AggregateResult,
  PreparationState,
  PreparationShare,
  PreparationMessage
> {
  readonly rounds = 1;
  readonly verifyKeySize: number;
  readonly nonceSize = 16;
  readonly randSize: number;

  constructor(
    public readonly xof: XofConstructor,
    public readonly flp: Flp<Measurement, AggregateResult>,
    public readonly shares: number,
    public readonly proofs: number,
    public readonly id: number,
  ) {
    super();
    if (shares < 2 || Math.trunc(shares) !== shares || shares > 255) {
      throw new Error("shares must be an integer in [2, 256)");
    }
    if (proofs < 1 || Math.trunc(proofs) !== proofs || proofs > 255) {
      throw new Error("proofs must be an integer in [1, 256)");
    }
    this.verifyKeySize = xof.seedSize;
    this.randSize =
      xof.seedSize *
      (1 + 2 * (shares - 1) + (flp.jointRandLen === 0 ? 0 : shares));
  }

  isValid(
    _aggregationParameter: null,
    previousAggregationParameters: null[],
  ): boolean {
    return previousAggregationParameters.length === 0;
  }

  async shard(
    measurement: Measurement,
    nonce: Buffer,
    rand: Buffer,
  ): Promise<{ publicShare: PublicShare; inputShares: InputShare[] }> {
    const { flp, proofs } = this;

    if (rand.length !== this.randSize) {
      throw new Error(
        `rand length was ${rand.length} but must be ${this.randSize}`,
      );
    }

    const helperShares = await this.buildHelperShares(nonce, rand);
    const encodedMeasurement = flp.encode(measurement);
    const partialLeaderShare = await this.buildLeaderShare(
      encodedMeasurement,
      helperShares,
      nonce,
      rand,
    );

    const { publicShare, jointRands } = await this.jointRands([
      partialLeaderShare,
      ...helperShares,
    ]);

    const proveRands = await this.proveRands(rand);

    const leaderProofs = [];
    for (let proof = 0; proof < proofs; proof++) {
      const jointRand = chunk(flp.jointRandLen, proof, jointRands);
      const proveRand = chunk(flp.proveRandLen, proof, proveRands);
      leaderProofs.push(...flp.prove(encodedMeasurement, proveRand, jointRand));
    }

    const inputShares = this.addProof(
      leaderProofs,
      partialLeaderShare,
      helperShares,
    ).map(({ jointRandPart: _, ...share }) => share);

    return { inputShares, publicShare };
  }

  async prepareInit(
    verifyKey: Buffer,
    aggregatorId: number,
    _aggregationParameter: null,
    nonce: Buffer,
    { jointRandParts }: PublicShare,
    { blind, measurementShare, proofsShare }: InputShare,
  ): Promise<{
    preparationState: PreparationState;
    preparationShare: PreparationShare;
  }> {
    const { xof, flp, field, shares, proofs } = this;
    const { jointRandLen } = flp;

    const outputShare = flp.truncate(measurementShare);

    const queryRands = await this.pseudorandom(
      flp.queryRandLen * proofs,
      Usage.QueryRandomness,
      verifyKey,
      Buffer.concat([Buffer.of(proofs), nonce]),
    );
    let jointRands: bigint[];
    let correctedJointRandSeed: Buffer;
    let jointRandomnessPart: Buffer;

    if (this.useJointRand()) {
      const encoded = field.encode(measurementShare);

      jointRandomnessPart = await this.deriveSeed(blind, Usage.JointRandPart, [
        Uint8Array.of(aggregatorId),
        nonce,
        encoded,
      ]);
      jointRandParts[aggregatorId] = jointRandomnessPart;
      correctedJointRandSeed = await this.deriveSeed(
        Buffer.alloc(xof.seedSize),
        Usage.JointRandSeed,
        jointRandParts,
      );
      jointRands = await this.pseudorandom(
        jointRandLen * proofs,
        Usage.JointRandomness,
        correctedJointRandSeed,
        proofs,
      );
    } else {
      jointRands = [];
      jointRandomnessPart = Buffer.alloc(0);
      correctedJointRandSeed = Buffer.alloc(0);
    }

    const verifiersShare = [];
    for (let proof = 0; proof < proofs; proof++) {
      const jointRand = chunk(flp.jointRandLen, proof, jointRands);
      const queryRand = chunk(flp.queryRandLen, proof, queryRands);
      const proofShare = chunk(flp.proofLen, proof, proofsShare);
      verifiersShare.push(
        ...flp.query(
          measurementShare,
          proofShare,
          queryRand,
          jointRand,
          shares,
        ),
      );
    }

    return {
      preparationShare: {
        verifiersShare,
        jointRandomnessPart,
      },
      preparationState: {
        correctedJointRandSeed,
        outputShare,
      },
    };
  }

  prepareNext(
    preparationState: PreparationState,
    preparationMessage: PreparationMessage,
  ):
    | { preparationState: PreparationState; preparationShare: PreparationShare }
    | { outputShare: OutputShare } {
    const { jointRand } = preparationMessage;
    const { outputShare, correctedJointRandSeed } = preparationState;
    if (!jointRand.equals(correctedJointRandSeed)) {
      throw new Error("Verify error");
    }
    return { outputShare };
  }

  async unshardPreparationShares(
    _aggregationParameter: null,
    preparationShares: PreparationShare[],
  ): Promise<PreparationMessage> {
    const { flp, field, xof, proofs } = this;
    const { verifiers, jointRandParts } = preparationShares.reduce(
      ({ verifiers, jointRandParts }, prepShare) => {
        const { jointRandomnessPart, verifiersShare } = prepShare;
        return {
          verifiers: field.vecAdd(verifiers, verifiersShare),
          jointRandParts: [...jointRandParts, jointRandomnessPart],
        };
      },
      {
        verifiers: fill(flp.verifierLen * proofs, 0n),
        jointRandParts: [] as Buffer[],
      },
    );

    for (let proof = 0; proof < proofs; proof++) {
      const verifier = chunk(flp.verifierLen, proof, verifiers);
      if (!flp.decide(verifier)) {
        throw new Error("Verify error");
      }
    }

    if (this.useJointRand()) {
      return {
        jointRand: await this.deriveSeed(
          Buffer.alloc(xof.seedSize),
          Usage.JointRandSeed,
          jointRandParts,
        ),
      };
    } else {
      return { jointRand: Buffer.alloc(0) };
    }
  }

  aggregate(
    _aggregationParameter: null,
    outputShares: OutputShare[],
  ): AggregatorShare {
    const { field, flp } = this;
    return outputShares.reduce(
      (agg, share) => field.vecAdd(agg, share),
      fill(flp.outputLen, 0n),
    );
  }

  unshard(
    _aggregationParameter: null,
    aggregatorShares: AggregatorShare[],
    measurementCount: number,
  ): AggregateResult {
    const { field, flp } = this;
    return flp.decode(
      aggregatorShares.reduce(
        (agg, share) => field.vecAdd(agg, share),
        fill(flp.outputLen, 0n),
      ),
      measurementCount,
    );
  }

  encodeInputShare({
    wireMeasurementShare,
    wireProofShare,
    blind,
  }: InputShare): Buffer {
    return Buffer.concat([wireMeasurementShare, wireProofShare, blind]);
  }

  encodePublicShare({ jointRandParts }: PublicShare): Buffer {
    return Buffer.concat(jointRandParts);
  }

  encodeAggregatorShare(aggregatorShare: bigint[]): Buffer {
    return Buffer.from(this.field.encode(aggregatorShare));
  }

  encodePreparationShare({
    jointRandomnessPart,
    verifiersShare: verifierShare,
  }: PreparationShare): Buffer {
    return Buffer.concat([
      this.field.encode(verifierShare),
      jointRandomnessPart,
    ]);
  }

  encodePreparationMessage({ jointRand }: PreparationMessage): Buffer {
    return jointRand;
  }

  encodeAggregationParameter(_: null): Buffer {
    return Buffer.alloc(0);
  }

  encodeTestVectorOutputShare(outputShare: bigint[]): string[] {
    return outputShare.map((n) =>
      Buffer.from(integerToOctetStringLE(n, this.field.encodedSize)).toString(
        "hex",
      ),
    );
  }

  /** private below here  */

  private async deriveSeed(
    seed: Buffer,
    usage: Usage,
    parts: Uint8Array[],
  ): Promise<Buffer> {
    return Buffer.from(
      await this.xof.deriveSeed(
        seed,
        this.domainSeparationTag(usage),
        concat(parts),
      ),
    );
  }

  private async buildLeaderShare(
    encodedMeasurement: bigint[],
    helperShares: Share[],
    nonce: Buffer,
    rand: Buffer,
  ): Promise<Omit<Share, "proofsShare" | "wireProofShare">> {
    const { xof, field } = this;
    const measurementShare = helperShares.reduce(
      (measurementShare, helper) =>
        field.vecSub(measurementShare, helper.measurementShare),
      encodedMeasurement,
    );
    const wireMeasurementShare = Buffer.from(
      this.field.encode(measurementShare),
    );

    if (this.useJointRand()) {
      const blind = rand.subarray(
        helperShares.length * 3 * xof.seedSize,
        (helperShares.length * 3 + 1) * xof.seedSize,
      );

      const jointRandPart = await this.deriveSeed(blind, Usage.JointRandPart, [
        Uint8Array.of(0),
        nonce,
        field.encode(measurementShare),
      ]);

      return {
        blind,
        measurementShare,
        wireMeasurementShare,
        jointRandPart,
      };
    } else {
      return {
        blind: Buffer.alloc(0),
        measurementShare,
        wireMeasurementShare,
        jointRandPart: Buffer.alloc(0),
      };
    }
  }

  private addProof(
    proof: bigint[],
    leader: Omit<Share, "proofsShare" | "wireProofShare">,
    helpers: Share[],
  ): Share[] {
    const { field } = this;
    const proofsShare = helpers.reduce(
      (proofsShare, helper) => field.vecSub(proofsShare, helper.proofsShare),
      proof,
    );

    const wireProofShare = Buffer.from(field.encode(proofsShare));

    return [{ ...leader, wireProofShare, proofsShare }, ...helpers];
  }

  private useJointRand(): boolean {
    return this.flp.jointRandLen !== 0;
  }

  private buildHelperShares(nonce: Buffer, rand: Buffer): Promise<Share[]> {
    const { flp, xof, field, proofs } = this;
    const { proofLen, measurementLen } = flp;

    return Promise.all(
      arr(this.shares - 1, async (share) => {
        let wireMeasurementShare: Buffer;
        let wireProofShare: Buffer;
        let blind: Buffer;
        const { seedSize } = xof;

        if (this.useJointRand()) {
          [wireMeasurementShare, wireProofShare, blind] = arr(3, (offset) =>
            rand.subarray(
              seedSize * (share * 3 + offset),
              seedSize * (share * 3 + offset + 1),
            ),
          );
        } else {
          [wireMeasurementShare, wireProofShare] = arr(2, (offset) =>
            rand.subarray(
              seedSize * (share * 2 + offset),
              seedSize * (share * 2 + offset + 1),
            ),
          );
          blind = Buffer.alloc(0);
        }

        const shareId = Buffer.of(share + 1);

        const measurementShare = await this.pseudorandom(
          measurementLen,
          Usage.MeasurementShare,
          wireMeasurementShare,
          shareId,
        );

        const proofsShare = await this.pseudorandom(
          proofLen * proofs,
          Usage.ProofShare,
          wireProofShare,
          Buffer.from([proofs, share + 1]),
        );
        const jointRandPart = this.useJointRand()
          ? await this.deriveSeed(blind, Usage.JointRandPart, [
              shareId,
              nonce,
              field.encode(measurementShare),
            ])
          : Buffer.alloc(0);

        return {
          measurementShare,
          blind,
          wireMeasurementShare,
          wireProofShare,
          proofsShare,
          jointRandPart,
        };
      }),
    );
  }

  private pseudorandom(
    len: number,
    usage: Usage,
    seed: Buffer,
    binder?: number | Buffer,
  ): Promise<bigint[]> {
    const { xof, field } = this;
    return xof.expandIntoVec(
      field,
      seed,
      this.domainSeparationTag(usage),
      typeof binder === "number"
        ? Buffer.of(binder)
        : binder || Buffer.alloc(0),
      len,
    );
  }

  private get field(): Field {
    return this.flp.field;
  }

  private proveRands(rand: Buffer): Promise<bigint[]> {
    const { shares, flp, xof, proofs } = this;
    const { seedSize } = xof;
    const proveIndex = this.useJointRand()
      ? (shares - 1) * 3 + 1
      : (shares - 1) * 2;

    return this.pseudorandom(
      flp.proveRandLen * proofs,
      Usage.ProveRandomness,
      rand.subarray(proveIndex * seedSize, (proveIndex + 1) * seedSize),
      proofs,
    );
  }

  private async jointRands(
    shares: { jointRandPart: Buffer }[],
  ): Promise<{ jointRands: bigint[]; publicShare: PublicShare }> {
    if (!this.useJointRand()) {
      return { jointRands: [], publicShare: { jointRandParts: [] } };
    }
    const { flp, xof, proofs } = this;
    const jointRandParts = shares.map(({ jointRandPart }) => jointRandPart);
    const jointRandSeed = await this.deriveSeed(
      Buffer.alloc(xof.seedSize),
      Usage.JointRandSeed,
      jointRandParts,
    );
    const jointRands = await this.pseudorandom(
      flp.jointRandLen * proofs,
      Usage.JointRandomness,
      jointRandSeed,
      proofs,
    );

    return { jointRands, publicShare: { jointRandParts } };
  }
}
