import { Shares, Vdaf, VDAF_VERSION } from "@divviup/vdaf";
import { PrgConstructor } from "@divviup/prg";
import { fill, arr, split } from "@divviup/common";
import { Field } from "@divviup/field";
import { Flp } from "./flp";
import { Buffer } from "buffer";

type PrepareState = {
  outputShare: OutputShare;
  jointRandSeed: Buffer | null;
  outboundMessage: Buffer;
};
type AggregationParameter = null;
type AggregatorShare = bigint[];
type AggregationResult = number[];
type OutputShare = bigint[];
type Prio3Vdaf<Measurement> = Vdaf<
  Measurement,
  AggregationParameter,
  PrepareState,
  AggregatorShare,
  AggregationResult,
  OutputShare
>;

interface DecodedShare {
  inputShare: bigint[];
  proofShare: bigint[];
  blind: Buffer | null;
  jointRandPartsHint: Buffer[] | null;
}

interface Share {
  blind: Buffer;
  jointRandPart: Uint8Array;
  inputShare: bigint[];
  proofShare: bigint[];
  inputShareSeed?: Buffer;
  proofShareSeed?: Buffer;
  jointRandPartsHint?: Uint8Array[];
}

const DOMAIN_SEPARATION_TAG_BASE = Buffer.from(VDAF_VERSION, "ascii");
const DOMAIN_SEPARATION_TAG_LEN = DOMAIN_SEPARATION_TAG_BASE.length + 4;
export class Prio3<Measurement> implements Prio3Vdaf<Measurement> {
  readonly rounds = 1;
  readonly verifyKeySize: number;

  constructor(
    public readonly prg: PrgConstructor,
    public readonly flp: Flp<Measurement>,
    public readonly shares: number,
    public readonly algorithmId: number
  ) {
    this.verifyKeySize = prg.seedSize;
  }

  private domainSeparationTag(): Buffer {
    const buffer = Buffer.alloc(DOMAIN_SEPARATION_TAG_LEN);
    DOMAIN_SEPARATION_TAG_BASE.copy(buffer, 0);
    buffer.writeUInt32BE(this.algorithmId, DOMAIN_SEPARATION_TAG_BASE.length);
    return buffer;
  }

  private async pseudorandom(
    len: number,
    seed?: Buffer,
    info?: number | Buffer
  ): Promise<bigint[]> {
    const { prg, field } = this;

    const domainSeparationTag = this.domainSeparationTag();

    let prgInfo;
    if (typeof info === "number") {
      prgInfo = Buffer.from([...domainSeparationTag, info]);
    } else if (info instanceof Buffer) {
      prgInfo = Buffer.concat([domainSeparationTag, info]);
    } else {
      prgInfo = domainSeparationTag;
    }

    return prg.expandIntoVec(field, seed || prg.randomSeed(), prgInfo, len);
  }

  private get field(): Field {
    return this.flp.field;
  }

  async measurementToInputShares(measurement: Measurement): Promise<Shares> {
    const { flp, field } = this;
    const helperShares = await this.buildHelperShares();
    const input = flp.encode(measurement);
    const leader = await this.buildLeaderShare(input, helperShares);

    const jointRandParts = [leader, ...helperShares].map(
      (share) => share.jointRandPart
    );
    const jointRandSeed = await this.deriveJointRandomness(jointRandParts);

    // Each aggregator gets a "hint" consisting of the "joint randomness part"
    // seeds derived from every other aggregator's shares. The aggregators
    // compute a "joint randomness part" seed from their own share, reassemble
    // the list of parts, and derive the final joint randomness seed from that
    // list.
    for (let i = 0; i < helperShares.length; i++) {
      helperShares[i].jointRandPartsHint = [
        ...jointRandParts.slice(0, i + 1),
        ...jointRandParts.slice(i + 2),
      ];
    }

    const proof = flp.prove(
      input,
      await this.pseudorandom(flp.proveRandLen),
      await this.pseudorandom(flp.jointRandLen, Buffer.from(jointRandSeed))
    );

    const leaderShare = {
      ...leader,
      proofShare: helperShares.reduce(
        (proofShare, helper) => field.vecSub(proofShare, helper.proofShare),
        proof
      ),
      jointRandPartsHint: jointRandParts.slice(1),
    };

    return {
      publicShare: Buffer.alloc(0),
      inputShares: this.encodeShares([leaderShare, ...helperShares]),
    };
  }

  async initialPrepareState(
    verifyKey: Buffer,
    aggregatorId: number,
    _aggParam: AggregationParameter,
    nonce: Buffer,
    _publicShare: Buffer,
    encodedInputShare: Buffer
  ): Promise<PrepareState> {
    const { prg, flp, field } = this;

    const share = await this.decodeShare(aggregatorId, encodedInputShare);

    const outputShare = flp.truncate(share.inputShare);

    const queryRand = await this.pseudorandom(
      flp.queryRandLen,
      verifyKey,
      Buffer.from([255, ...nonce])
    );

    let jointRand: bigint[];
    let jointRandSeed: Buffer | null;
    let shareJointRandPart: Buffer | null;

    if (flp.jointRandLen > 0 && share.blind && share.jointRandPartsHint) {
      const encoded = field.encode(share.inputShare);
      shareJointRandPart = Buffer.from(
        await prg.deriveSeed(
          share.blind,
          Buffer.from([...this.domainSeparationTag(), aggregatorId, ...encoded])
        )
      );
      const jointRandParts = [
        ...share.jointRandPartsHint.slice(0, aggregatorId),
        shareJointRandPart,
        ...share.jointRandPartsHint.slice(aggregatorId),
      ];
      jointRandSeed = Buffer.from(
        await this.deriveJointRandomness(jointRandParts)
      );
      jointRand = await this.pseudorandom(flp.jointRandLen, jointRandSeed);
    } else {
      jointRand = [];
      jointRandSeed = null;
      shareJointRandPart = null;
    }

    const verifierShare = flp.query(
      share.inputShare,
      share.proofShare,
      queryRand,
      jointRand,
      this.shares
    );

    const outboundMessage = this.encodePrepareShare(
      verifierShare,
      shareJointRandPart
    );

    return { outputShare, jointRandSeed, outboundMessage };
  }

  prepareNext(
    prepareState: PrepareState,
    inbound: Buffer | null
  ):
    | { prepareState: PrepareState; prepareShare: Buffer }
    | { outputShare: OutputShare } {
    if (!inbound) {
      return {
        prepareState,
        prepareShare: prepareState.outboundMessage,
      };
    }

    const jointRandCheck = this.decodePrepareMessage(inbound);

    const jointRandEquality =
      (jointRandCheck &&
        prepareState.jointRandSeed &&
        0 === Buffer.compare(jointRandCheck, prepareState.jointRandSeed)) ||
      jointRandCheck === prepareState.jointRandSeed; // both null

    if (!jointRandEquality) {
      throw new Error("Verify error");
    }

    return { outputShare: prepareState.outputShare };
  }

  async prepSharesToPrepareMessage(
    _aggParam: AggregationParameter,
    encodedPrepShares: Buffer[]
  ): Promise<Buffer> {
    const { flp, field } = this;
    const jointRandParts: Buffer[] = [];

    const verifier = encodedPrepShares.reduce((verifier, encodedPrepShare) => {
      const { verifier: shareVerifier, jointRandPart: shareJointRandPart } =
        this.decodePrepareShare(encodedPrepShare);

      if (flp.jointRandLen > 0 && shareJointRandPart) {
        jointRandParts.push(shareJointRandPart);
      }

      return field.vecAdd(verifier, shareVerifier);
    }, fill(flp.verifierLen, 0n));

    if (!flp.decide(verifier)) {
      throw new Error("Verify error");
    }

    if (flp.jointRandLen > 0) {
      return Buffer.from(await this.deriveJointRandomness(jointRandParts));
    } else {
      return Buffer.alloc(0);
    }
  }

  outputSharesToAggregatorShare(
    _aggParam: AggregationParameter,
    outShares: OutputShare[]
  ): AggregatorShare {
    const { field, flp } = this;
    return outShares.reduce(
      (agg, share) => field.vecAdd(agg, share),
      fill(flp.outputLen, 0n)
    );
  }

  aggregatorSharesToResult(
    _aggParam: AggregationParameter,
    aggShares: AggregatorShare[]
  ): AggregationResult {
    const { field, flp } = this;
    return aggShares
      .reduce((agg, share) => field.vecAdd(agg, share), fill(flp.outputLen, 0n))
      .map(Number);
  }

  private async decodeShare(
    aggregatorId: number,
    encoded: Buffer
  ): Promise<DecodedShare> {
    return aggregatorId == 0
      ? this.decodeLeaderShare(encoded)
      : await this.decodeHelperShare(aggregatorId, encoded);
  }

  private decodePrepareShare(input: Buffer): {
    verifier: bigint[];
    jointRandPart: Buffer | null;
  } {
    const { flp, prg, field } = this;
    // eslint-disable-next-line prefer-const
    let [encodedVerifier, encoded] = split(
      input,
      field.encodedSize * flp.verifierLen
    );

    const verifier = field.decode(encodedVerifier);

    let jointRandPart: null | Buffer = null;
    if (flp.jointRandLen > 0) {
      [jointRandPart, encoded] = split(encoded, prg.seedSize);
    }

    if (encoded.length > 0) {
      throw new Error("unused bytes at end of prepare message");
    }

    return { verifier, jointRandPart };
  }

  private encodePrepareShare(
    verifier: bigint[],
    jointRandPart: Buffer | null
  ): Buffer {
    const verifierEncoded = this.field.encode(verifier);

    if (this.flp.jointRandLen > 0 && jointRandPart) {
      return Buffer.concat([verifierEncoded, jointRandPart]);
    } else {
      return Buffer.from(verifierEncoded);
    }
  }

  private decodePrepareMessage(encoded: Buffer): Buffer | null {
    const { flp, prg } = this;

    let jointRandCheck = null;
    if (flp.jointRandLen > 0) {
      [jointRandCheck, encoded] = split(encoded, prg.seedSize);
    }

    if (encoded.length > 0) {
      throw new Error("unused bytes at end of prepare message share");
    }

    return jointRandCheck;
  }

  private async buildLeaderShare(
    input: bigint[],
    helperShares: Share[]
  ): Promise<{
    inputShare: bigint[];
    blind: Buffer;
    jointRandPart: Uint8Array;
  }> {
    const { prg, field } = this;
    const inputShare = helperShares.reduce(
      (inputShare, helper) => field.vecSub(inputShare, helper.inputShare),
      input
    );
    const blind = Buffer.from(prg.randomSeed());
    const encoded = field.encode(inputShare);
    const jointRandPart = await prg.deriveSeed(
      blind,
      Buffer.from([...this.domainSeparationTag(), 0, ...encoded])
    );
    return { inputShare, blind, jointRandPart };
  }

  private buildHelperShares(): Promise<Share[]> {
    const { flp, prg, field } = this;
    return Promise.all(
      arr(this.shares - 1, async (j) => {
        const blind = Buffer.from(prg.randomSeed());
        const inputShareSeed = Buffer.from(prg.randomSeed());
        const inputShare = await this.pseudorandom(
          flp.inputLen,
          inputShareSeed,
          j + 1
        );
        const encoded = field.encode(inputShare);
        const jointRandPart = await prg.deriveSeed(
          blind,
          Buffer.from([...this.domainSeparationTag(), j + 1, ...encoded])
        );
        const proofShareSeed = Buffer.from(prg.randomSeed());
        const proofShare = await this.pseudorandom(
          flp.proofLen,
          proofShareSeed,
          j + 1
        );

        return {
          inputShare,
          blind,
          jointRandPart,
          proofShare,
          inputShareSeed,
          proofShareSeed,
        };
      })
    );
  }

  private async deriveJointRandomness(
    parts: Uint8Array[]
  ): Promise<Uint8Array> {
    const prg = this.prg;

    const info = Buffer.concat([
      this.domainSeparationTag(),
      new Uint8Array([255]),
      ...parts,
    ]);
    return await prg.deriveSeed(Buffer.alloc(prg.seedSize), info);
  }

  private encodeShares(shares: Share[]): Buffer[] {
    return shares.map((share) => this.encodeShare(share));
  }

  private encodeShare(share: Share): Buffer {
    const { flp } = this;
    const inputShareSeed =
      "inputShareSeed" in share ? share.inputShareSeed : null;
    const proofShareSeed =
      "proofShareSeed" in share ? share.proofShareSeed : null;

    return Buffer.concat([
      inputShareSeed || flp.field.encode(share.inputShare),
      proofShareSeed || flp.field.encode(share.proofShare),
      ...(flp.jointRandLen > 0 && share.blind && share.jointRandPartsHint
        ? [share.blind, ...share.jointRandPartsHint]
        : []),
    ]);
  }

  private decodeLeaderShare(encoded: Buffer): DecodedShare {
    const { flp, prg, field } = this;
    let encodedInputShare: Buffer, encodedProofShare: Buffer;
    [encodedInputShare, encoded] = split(
      encoded,
      field.encodedSize * flp.inputLen
    );
    [encodedProofShare, encoded] = split(
      encoded,
      field.encodedSize * flp.proofLen
    );

    const inputShare = field.decode(encodedInputShare);
    const proofShare = field.decode(encodedProofShare);

    let blind: Buffer | null = null;
    let jointRandPartsHint: Buffer[] | null = null;
    let jointRandPart = null;

    if (flp.jointRandLen > 0) {
      jointRandPartsHint = [];
      [blind, encoded] = split(encoded, prg.seedSize);
      for (let i = 0; i < this.shares - 1; i++) {
        [jointRandPart, encoded] = split(encoded, prg.seedSize);
        jointRandPartsHint.push(jointRandPart);
      }
    }

    if (encoded.length > 0) {
      throw new Error("unexpected extra leader share bytes");
    }

    return { inputShare, proofShare, blind, jointRandPartsHint };
  }

  private async decodeHelperShare(
    aggregatorId: number,
    encoded: Buffer
  ): Promise<DecodedShare> {
    const { prg, flp } = this;
    let inputShareSeed, proofShareSeed;
    [inputShareSeed, encoded] = split(encoded, prg.seedSize);
    [proofShareSeed, encoded] = split(encoded, prg.seedSize);

    const inputShare = await this.pseudorandom(
      flp.inputLen,
      inputShareSeed,
      aggregatorId
    );
    const proofShare = await this.pseudorandom(
      flp.proofLen,
      proofShareSeed,
      aggregatorId
    );

    let blind = null;
    let jointRandPartsHint = null;
    let jointRandPart = null;
    if (flp.jointRandLen > 0) {
      jointRandPartsHint = [];
      [blind, encoded] = split(encoded, prg.seedSize);
      for (let i = 0; i < this.shares - 1; i++) {
        [jointRandPart, encoded] = split(encoded, prg.seedSize);
        jointRandPartsHint.push(jointRandPart);
      }
    }

    if (encoded.length > 0) {
      throw new Error("unused bytes in decoding helper share");
    }

    return { inputShare, proofShare, blind, jointRandPartsHint };
  }
}
