import type { Shares } from "@divviup/vdaf";
import { Vdaf } from "@divviup/vdaf";
import type { XofConstructor } from "@divviup/xof";
import { fill, arr, concat } from "@divviup/common";
import { Field } from "@divviup/field";
import type { Flp } from "./flp.js";
import { Buffer } from "buffer";

type PrepareState = {
  outputShare: OutputShare;
  correctedJointRand: Buffer;
  outboundMessage: Buffer;
};
type AggregationParameter = null;
type AggregatorShare = bigint[];
type OutputShare = bigint[];

interface DecodedShare {
  measurementShare: bigint[];
  proofShare: bigint[];
  blind: Buffer;
}

interface Share {
  measurementShare: bigint[];
  wireMeasurementShare: Buffer;
  blind: Buffer;
  wireProofShare: Buffer;
  proofShare: bigint[];
  jointRandSeed: Buffer;
}

enum Usage {
  MeasurementShare = 1,
  ProofShare = 2,
  JointRandomness = 3,
  ProveRandomness = 4,
  QueryRandomness = 5,
  JointRandSeed = 6,
  JointRandPart = 7,
}

export class Prio3<Measurement, AggregationResult> extends Vdaf<
  Measurement,
  AggregationParameter,
  PrepareState,
  AggregatorShare,
  AggregationResult,
  OutputShare
> {
  readonly rounds = 1;
  readonly verifyKeySize: number;
  readonly nonceSize = 16;
  readonly randSize: number;

  constructor(
    public readonly xof: XofConstructor,
    public readonly flp: Flp<Measurement, AggregationResult>,
    public readonly shares: number,
    public readonly id: number,
  ) {
    super();
    this.verifyKeySize = xof.seedSize;
    this.randSize =
      xof.seedSize *
      (1 + 2 * (shares - 1) + (flp.jointRandLen === 0 ? 0 : shares));
  }

  async measurementToInputShares(
    measurement: Measurement,
    nonce: Buffer,
    rand: Buffer,
  ): Promise<Shares> {
    const { flp } = this;

    if (rand.length !== this.randSize) {
      throw new Error(
        `rand length was ${rand.length} but must be ${this.randSize}`,
      );
    }

    const helperShares = await this.buildHelperShares(nonce, rand);
    const input = flp.encode(measurement);
    const partialLeaderShare = await this.buildLeaderShare(
      input,
      helperShares,
      nonce,
      rand,
    );

    const { publicShare, jointRand } = await this.jointRand([
      partialLeaderShare,
      ...helperShares,
    ]);

    const proveRand = await this.proveRand(rand);
    const proof = flp.prove(input, proveRand, jointRand);
    const shares = this.addProof(proof, partialLeaderShare, helperShares);
    const inputShares = this.encodeShares(shares);

    return { publicShare, inputShares };
  }

  async initialPrepareState(
    verifyKey: Buffer,
    aggregatorId: number,
    _aggParam: AggregationParameter,
    nonce: Buffer,
    publicShare: Buffer,
    encodedInputShare: Buffer,
  ): Promise<PrepareState> {
    const { xof, flp, field, shares } = this;
    const { jointRandLen } = flp;

    const { jointRandParts } = this.decodePublicShare(publicShare);

    const { blind, measurementShare, proofShare } = await this.decodeShare(
      aggregatorId,
      encodedInputShare,
    );

    const outputShare = flp.truncate(measurementShare);

    const queryRand = await this.pseudorandom(
      flp.queryRandLen,
      Usage.QueryRandomness,
      verifyKey,
      nonce,
    );
    let jointRand: bigint[];
    let correctedJointRand: Buffer;

    if (this.useJointRand()) {
      const encoded = field.encode(measurementShare);

      jointRandParts[aggregatorId] = await this.deriveSeed(
        blind,
        Usage.JointRandPart,
        [Uint8Array.of(aggregatorId), nonce, encoded],
      );
      correctedJointRand = await this.deriveSeed(
        Buffer.alloc(xof.seedSize),
        Usage.JointRandSeed,
        jointRandParts,
      );
      jointRand = await this.pseudorandom(
        jointRandLen,
        Usage.JointRandomness,
        correctedJointRand,
      );
    } else {
      jointRand = [];
      correctedJointRand = Buffer.alloc(0);
    }

    const verifierShare = flp.query(
      measurementShare,
      proofShare,
      queryRand,
      jointRand,
      shares,
    );

    const outboundMessage = this.encodePrepareShare(
      verifierShare,
      jointRandParts[aggregatorId],
    );

    return { outputShare, correctedJointRand, outboundMessage };
  }

  prepareNext(
    prepareState: PrepareState,
    inbound: Buffer | null,
  ):
    | { prepareState: PrepareState; prepareShare: Buffer }
    | { outputShare: OutputShare } {
    if (!inbound) {
      return {
        prepareState,
        prepareShare: prepareState.outboundMessage,
      };
    }

    const { correctedJointRand, outputShare } = prepareState;

    if (!this.decodePrepareMessage(inbound).equals(correctedJointRand)) {
      throw new Error("Verify error");
    }

    return { outputShare };
  }

  prepSharesToPrepareMessage(
    _aggParam: AggregationParameter,
    prepShares: Buffer[],
  ): Promise<Buffer> {
    const { flp, field, xof } = this;
    const { verifier, jointRandParts } = prepShares.reduce(
      ({ verifier, jointRandParts }, prepShare) => {
        const { verifier: shareVerifier, jointRandPart } =
          this.decodePrepareShare(prepShare);
        return {
          verifier: field.vecAdd(verifier, shareVerifier),
          jointRandParts: [...jointRandParts, jointRandPart],
        };
      },
      { verifier: fill(flp.verifierLen, 0n), jointRandParts: [] as Buffer[] },
    );

    if (!flp.decide(verifier)) {
      throw new Error("Verify error");
    }

    if (this.useJointRand()) {
      return this.deriveSeed(
        Buffer.alloc(xof.seedSize),
        Usage.JointRandSeed,
        jointRandParts,
      );
    } else {
      return Promise.resolve(Buffer.alloc(0));
    }
  }

  outputSharesToAggregatorShare(
    _aggParam: AggregationParameter,
    outShares: OutputShare[],
  ): AggregatorShare {
    const { field, flp } = this;
    return outShares.reduce(
      (agg, share) => field.vecAdd(agg, share),
      fill(flp.outputLen, 0n),
    );
  }

  aggregatorSharesToResult(
    _aggParam: AggregationParameter,
    aggShares: AggregatorShare[],
    measurementCount: number,
  ): AggregationResult {
    const { field, flp } = this;
    return flp.decode(
      aggShares.reduce(
        (agg, share) => field.vecAdd(agg, share),
        fill(flp.outputLen, 0n),
      ),
      measurementCount,
    );
  }

  /** private below here  */

  private async decodeShare(
    aggregatorId: number,
    encoded: Buffer,
  ): Promise<DecodedShare> {
    return aggregatorId == 0
      ? this.decodeLeaderShare(encoded)
      : await this.decodeHelperShare(aggregatorId, encoded);
  }

  private decodePrepareShare(input: Buffer): {
    verifier: bigint[];
    jointRandPart: Buffer;
  } {
    const {
      flp: { verifierLen },
      xof: { seedSize },
      field,
    } = this;
    const { encodedSize } = field;

    const expectedLength =
      encodedSize * verifierLen + (this.useJointRand() ? seedSize : 0);
    if (input.length !== expectedLength) {
      throw new Error(
        `expected prepare share to be ${expectedLength} bytes, but was ${input.length}`,
      );
    }

    const verifier = field.decode(input.subarray(0, encodedSize * verifierLen));
    const jointRandPart = input.subarray(encodedSize * verifierLen);
    return { verifier, jointRandPart };
  }

  private encodePrepareShare(
    verifier: bigint[],
    jointRandPart: Buffer | null,
  ): Buffer {
    const verifierEncoded = this.field.encode(verifier);

    if (this.flp.jointRandLen > 0 && jointRandPart) {
      return Buffer.concat([verifierEncoded, jointRandPart]);
    } else {
      return Buffer.from(verifierEncoded);
    }
  }

  private decodePrepareMessage(encoded: Buffer): Buffer {
    const { xof } = this;
    if (encoded.length !== (this.useJointRand() ? xof.seedSize : 0)) {
      throw new Error(
        `expected prepare message to be ${xof.seedSize} bytes, but was ${encoded.length}`,
      );
    }
    return encoded;
  }

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
    input: bigint[],
    helperShares: Share[],
    nonce: Buffer,
    rand: Buffer,
  ): Promise<Omit<Share, "proofShare" | "wireProofShare">> {
    const { xof, field } = this;
    const measurementShare = helperShares.reduce(
      (measurementShare, helper) =>
        field.vecSub(measurementShare, helper.measurementShare),
      input,
    );
    const wireMeasurementShare = Buffer.from(
      this.field.encode(measurementShare),
    );

    if (this.useJointRand()) {
      const blind = rand.subarray(
        helperShares.length * 3 * xof.seedSize,
        (helperShares.length * 3 + 1) * xof.seedSize,
      );

      const jointRandSeed = await this.deriveSeed(blind, Usage.JointRandPart, [
        Uint8Array.of(0),
        nonce,
        field.encode(measurementShare),
      ]);

      return {
        blind,
        measurementShare,
        wireMeasurementShare,
        jointRandSeed,
      };
    } else {
      return {
        blind: Buffer.alloc(0),
        measurementShare,
        wireMeasurementShare,
        jointRandSeed: Buffer.alloc(0),
      };
    }
  }

  private addProof(
    proof: bigint[],
    leader: Omit<Share, "proofShare" | "wireProofShare">,
    helpers: Share[],
  ): Share[] {
    const { field } = this;
    const proofShare = helpers.reduce(
      (proofShare, helper) => field.vecSub(proofShare, helper.proofShare),
      proof,
    );

    const wireProofShare = Buffer.from(field.encode(proofShare));

    return [{ ...leader, wireProofShare, proofShare }, ...helpers];
  }

  private useJointRand(): boolean {
    return this.flp.jointRandLen !== 0;
  }

  private buildHelperShares(nonce: Buffer, rand: Buffer): Promise<Share[]> {
    const { flp, xof, field } = this;
    const { proofLen, inputLen } = flp;
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
          inputLen,
          Usage.MeasurementShare,
          wireMeasurementShare,
          shareId,
        );

        const proofShare = await this.pseudorandom(
          proofLen,
          Usage.ProofShare,
          wireProofShare,
          shareId,
        );

        const jointRandSeed = this.useJointRand()
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
          proofShare,
          jointRandSeed,
        };
      }),
    );
  }

  private encodeShares(shares: Share[]): Buffer[] {
    return shares.map((share) => this.encodeShare(share));
  }

  private encodeShare(share: Share): Buffer {
    const { blind, wireMeasurementShare, wireProofShare } = share;
    return Buffer.concat([wireMeasurementShare, wireProofShare, blind]);
  }

  private decodeLeaderShare(encoded: Buffer): DecodedShare {
    const { flp, xof, field } = this;
    const { encodedSize } = field;
    const { inputLen, proofLen } = flp;
    const { seedSize } = xof;

    const expectedLength =
      encodedSize * (inputLen + proofLen) +
      (this.useJointRand() ? seedSize : 0);
    if (encoded.length != expectedLength) {
      throw new Error(
        `expected leader share to be ${expectedLength} bytes but it was ${encoded.length}`,
      );
    }

    const measurementShare = field.decode(
      encoded.subarray(0, encodedSize * inputLen),
    );
    const proofShare = field.decode(
      encoded.subarray(
        encodedSize * inputLen,
        encodedSize * (inputLen + proofLen),
      ),
    );
    const blind = encoded.subarray(encodedSize * (inputLen + proofLen));

    return { measurementShare, proofShare, blind };
  }

  private async decodeHelperShare(
    aggregatorId: number,
    encoded: Buffer,
  ): Promise<DecodedShare> {
    const { xof, flp } = this;
    const { seedSize } = xof;
    const { inputLen, proofLen } = flp;

    const expectedLength = seedSize * (this.useJointRand() ? 3 : 2);
    if (encoded.length != expectedLength) {
      throw new Error(
        `expected helper share to be ${expectedLength} bytes but it was ${encoded.length}`,
      );
    }

    const measurementShare = await this.pseudorandom(
      inputLen,
      Usage.MeasurementShare,
      encoded.subarray(0, seedSize),
      aggregatorId,
    );

    const proofShare = await this.pseudorandom(
      proofLen,
      Usage.ProofShare,
      encoded.subarray(seedSize, seedSize * 2),
      aggregatorId,
    );

    const blind = encoded.subarray(2 * seedSize);

    return { measurementShare, proofShare, blind };
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

  private proveRand(rand: Buffer): Promise<bigint[]> {
    const { shares, flp, xof } = this;
    const { seedSize } = xof;
    const proveIndex = this.useJointRand()
      ? (shares - 1) * 3 + 1
      : (shares - 1) * 2;

    return this.pseudorandom(
      flp.proveRandLen,
      Usage.ProveRandomness,
      rand.subarray(proveIndex * seedSize, (proveIndex + 1) * seedSize),
    );
  }

  private async jointRand(
    shares: { jointRandSeed: Buffer }[],
  ): Promise<{ jointRand: bigint[]; publicShare: Buffer }> {
    if (!this.useJointRand()) {
      return { jointRand: [], publicShare: Buffer.alloc(0) };
    }
    const { flp, xof } = this;
    const seeds = shares.map((h) => h.jointRandSeed);
    const jointRandSeed = await this.deriveSeed(
      Buffer.alloc(xof.seedSize),
      Usage.JointRandSeed,
      seeds,
    );
    const publicShare = Buffer.concat(seeds);

    const jointRand = await this.pseudorandom(
      flp.jointRandLen,
      Usage.JointRandomness,
      jointRandSeed,
    );

    return { jointRand, publicShare };
  }

  private decodePublicShare(encoded: Buffer): { jointRandParts: Buffer[] } {
    if (!this.useJointRand()) {
      if (encoded.length > 0)
        throw new Error("unexpected public share for flp with no joint rand");
      return { jointRandParts: [] };
    }

    const { shares, xof } = this;
    const { seedSize } = xof;

    if (encoded.length !== seedSize * shares)
      throw new Error(
        `unexpected public share length ${encoded.length}, expected ${
          seedSize * shares
        }`,
      );

    return {
      jointRandParts: arr(shares, (share) =>
        encoded.subarray(share * seedSize, (share + 1) * seedSize),
      ),
    };
  }
}
