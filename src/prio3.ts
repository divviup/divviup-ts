import { Vdaf } from "vdaf";
import { PrgAes128, PrgConstructor } from "prng";
import { VDAF_VERSION, arr, xorWith, split, xorInPlace } from "common";
import { Vector, Field } from "field";
import { FlpGeneric } from "prio3/genericFlp";
import { Count } from "prio3/circuits/count";
import { Histogram } from "prio3/circuits/histogram";
import { Flp } from "prio3/flp";
import { Sum } from "prio3/circuits/sum";

type PrepareMessage = {
  outputShare: OutputShare;
  jointRandSeed: Buffer | null;
  outboundMessage: Buffer;
};
type PublicParameter = null;
type VerifyParameter = [number, Buffer];
type AggregationParameter = null;
type AggregatorShare = Vector;
type AggregationResult = number[];
type OutputShare = Vector;
type PrioVdaf<Measurement> = Vdaf<
  Measurement,
  PublicParameter,
  VerifyParameter,
  AggregationParameter,
  PrepareMessage,
  AggregatorShare,
  AggregationResult,
  OutputShare
>;

interface DecodedShare {
  inputShare: Vector;
  proofShare: Vector;
  blind: Buffer | null;
  hint: Buffer | null;
}

interface Share {
  blind: Buffer;
  hint: Buffer;
  inputShare: Vector;
  proofShare: Vector;
  inputShareSeed?: Buffer;
  proofShareSeed?: Buffer;
}

const DOMAIN_SEPARATION_TAG = Buffer.from(`${VDAF_VERSION} prio3`, "ascii");

export class Prio3<Measurement> implements PrioVdaf<Measurement> {
  readonly rounds = 1;

  constructor(
    public readonly prg: PrgConstructor,
    public readonly flp: Flp<Measurement>,
    public readonly shares: number
  ) {}

  async pseudorandom(
    len: number,
    seed?: Buffer,
    info?: number
  ): Promise<Vector> {
    const { prg, field } = this;
    return prg.expandIntoVec(
      field,
      seed || prg.randomSeed(),
      typeof info === "number"
        ? Buffer.from([...DOMAIN_SEPARATION_TAG, info])
        : DOMAIN_SEPARATION_TAG,
      len
    );
  }

  get field(): Field {
    return this.flp.field;
  }

  setup(): [PublicParameter, VerifyParameter[]] {
    const queryInit = this.prg.randomSeed();
    const verifyParam = arr(
      this.shares,
      (j) => [j, queryInit] as [number, Buffer]
    );
    return [null, verifyParam];
  }

  async measurementToInputShares(
    _publicParam: PublicParameter,
    measurement: Measurement
  ): Promise<Buffer[]> {
    const { flp, prg, field } = this;
    const jointRandSeed = Buffer.alloc(prg.seedSize);
    const helperShares = await this.buildHelperShares();
    const input = flp.encode(measurement);
    const leader = await this.buildLeaderShare(input, helperShares);

    for (const share of [leader, ...helperShares]) {
      xorInPlace(jointRandSeed, share.hint);
    }

    for (const share of [leader, ...helperShares]) {
      xorInPlace(share.hint, jointRandSeed);
    }

    const proof = flp.prove(
      input,
      await this.pseudorandom(flp.proveRandLen),
      await this.pseudorandom(flp.jointRandLen, jointRandSeed)
    );

    const leaderShare = {
      ...leader,
      proofShare: helperShares.reduce(
        (proofShare, helper) => field.vecSub(proofShare, helper.proofShare),
        proof
      ),
    };

    return this.encodeShares([leaderShare, ...helperShares]);
  }

  async initialPrepareMessage(
    verifyParam: VerifyParameter,
    _aggParam: AggregationParameter,
    nonce: Buffer,
    encodedInputShare: Buffer
  ): Promise<PrepareMessage> {
    const { prg, flp, field } = this;
    const [j, queryInit] = verifyParam;

    const share = await this.decodeShare(j, encodedInputShare);

    const outputShare = flp.truncate(share.inputShare);

    const queryRandSeed = await prg.deriveSeed(
      queryInit,
      Buffer.from([255, ...nonce])
    );

    const queryRand = await this.pseudorandom(flp.queryRandLen, queryRandSeed);

    let jointRand: Vector;
    let jointRandSeed: Buffer | null;
    let shareJointRandSeed: Buffer | null;

    if (flp.jointRandLen > 0 && share.blind && share.hint) {
      const encoded = field.encode(share.inputShare);
      shareJointRandSeed = await prg.deriveSeed(
        share.blind,
        Buffer.from([j, ...encoded])
      );
      jointRandSeed = xorWith(share.hint, shareJointRandSeed);
      jointRand = await this.pseudorandom(flp.jointRandLen, jointRandSeed);
    } else {
      jointRand = field.vec([]);
      jointRandSeed = null;
      shareJointRandSeed = null;
    }

    const verifierShare = flp.query(
      share.inputShare,
      share.proofShare,
      queryRand,
      jointRand,
      this.shares
    );

    const outboundMessage = this.encodePrepareMessage(
      verifierShare,
      shareJointRandSeed
    );

    return { outputShare, jointRandSeed, outboundMessage };
  }

  prepareNext(
    prepareMessage: PrepareMessage,
    inbound: Buffer | null
  ):
    | { prepareMessage: PrepareMessage; prepareShare: Buffer }
    | { outputShare: OutputShare } {
    if (!inbound) {
      return { prepareMessage, prepareShare: prepareMessage.outboundMessage };
    }

    const { verifier, jointRand } = this.decodePrepareMessage(inbound);

    const jointRandEquality =
      (jointRand &&
        prepareMessage.jointRandSeed &&
        0 === Buffer.compare(jointRand, prepareMessage.jointRandSeed)) ||
      jointRand === prepareMessage.jointRandSeed; // both null

    if (!jointRandEquality || !this.flp.decide(verifier)) {
      throw new Error("Verify error");
    }

    return { outputShare: prepareMessage.outputShare };
  }

  async decodeShare(j: number, encoded: Buffer): Promise<DecodedShare> {
    return j == 0
      ? this.decodeLeaderShare(encoded)
      : await this.decodeHelperShare(j, encoded);
  }

  prepSharesToPrepareMessage(
    _aggParam: AggregationParameter,
    encodedPrepShares: Buffer[]
  ): Buffer {
    const { flp, prg, field } = this;
    const jointRandCheck = Buffer.alloc(prg.seedSize);

    const verifier = encodedPrepShares.reduce(
      (verifier, encodedPrepMessage) => {
        field.vec(flp.verifierLen);

        const { verifier: shareVerifier, jointRand: shareJointRand } =
          this.decodePrepareMessage(encodedPrepMessage);

        if (flp.jointRandLen > 0 && shareJointRand) {
          xorInPlace(jointRandCheck, shareJointRand);
        }

        return field.vecAdd(verifier, shareVerifier);
      },
      field.vec(flp.verifierLen)
    );

    return this.encodePrepareMessage(verifier, jointRandCheck);
  }

  outputSharesToAggregatorShare(
    _aggParam: AggregationParameter,
    outShares: OutputShare[]
  ): AggregatorShare {
    const { field, flp } = this;
    return outShares.reduce(
      (agg, share) => field.vecAdd(agg, share),
      field.vec(flp.outputLen)
    );
  }

  aggregatorSharesToResult(
    _aggParam: AggregationParameter,
    aggShares: AggregatorShare[]
  ): AggregationResult {
    const { field, flp } = this;
    return aggShares
      .reduce(
        (agg, share) => field.vecAdd(agg, share),
        field.vec(flp.outputLen)
      )
      .toValues()
      .map(Number);
  }

  testVectorVerifyParams(verifyParams: VerifyParameter[]): [number, string][] {
    return verifyParams.map(([j, queryInit]) => [j, queryInit.toString("hex")]);
  }

  private decodePrepareMessage(input: Buffer): {
    verifier: Vector;
    jointRand: Buffer | null;
  } {
    const { flp, prg, field } = this;
    // eslint-disable-next-line prefer-const
    let [encodedVerifier, encoded] = split(
      input,
      field.encodedSize * flp.verifierLen
    );

    const verifier = field.decode(encodedVerifier);

    let jointRand: null | Buffer = null;
    if (flp.jointRandLen > 0) {
      [jointRand, encoded] = split(encoded, prg.seedSize);
    }

    if (encoded.length) {
      throw new Error("unused bytes at end of prepare message");
    }

    return { verifier, jointRand };
  }

  private encodePrepareMessage(
    verifier: Vector,
    jointRandShares: Buffer | null
  ): Buffer {
    const verifierEncoded = this.field.encode(verifier);

    if (this.flp.jointRandLen > 0 && jointRandShares) {
      return Buffer.concat([verifierEncoded, jointRandShares]);
    } else {
      return verifierEncoded;
    }
  }

  private async buildLeaderShare(
    input: Vector,
    helperShares: Share[]
  ): Promise<{
    inputShare: Vector;
    blind: Buffer;
    hint: Buffer;
  }> {
    const { prg, field } = this;
    const inputShare = helperShares.reduce(
      (inputShare, helper) => field.vecSub(inputShare, helper.inputShare),
      input
    );
    const blind = prg.randomSeed();
    const encoded = field.encode(inputShare);
    const hint = await prg.deriveSeed(blind, Buffer.from([0, ...encoded]));
    return { inputShare, blind, hint };
  }

  private buildHelperShares(): Promise<Share[]> {
    const { flp, prg, field } = this;
    return Promise.all(
      arr(this.shares - 1, async (j) => {
        const blind = prg.randomSeed();
        const inputShareSeed = prg.randomSeed();
        const inputShare = await this.pseudorandom(
          flp.inputLen,
          inputShareSeed,
          j + 1
        );
        const encoded = field.encode(inputShare);
        const hint = await prg.deriveSeed(
          blind,
          Buffer.from([j + 1, ...encoded])
        );
        const proofShareSeed = prg.randomSeed();
        const proofShare = await this.pseudorandom(
          flp.proofLen,
          proofShareSeed,
          j + 1
        );

        return {
          inputShare,
          blind,
          hint,
          proofShare,
          inputShareSeed,
          proofShareSeed,
        };
      })
    );
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
      ...(flp.jointRandLen > 0 && share.blind && share.hint
        ? [share.blind, share.hint]
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
    let hint: Buffer | null = null;

    if (flp.jointRandLen > 0) {
      [blind, encoded] = split(encoded, prg.seedSize);
      [hint, encoded] = split(encoded, prg.seedSize);
    }

    if (encoded.length) {
      throw new Error("unexpected extra leader share bytes");
    }

    return { inputShare, proofShare, blind, hint };
  }

  private async decodeHelperShare(
    j: number,
    encoded: Buffer
  ): Promise<DecodedShare> {
    const { prg, flp } = this;
    let inputShareSeed, proofShareSeed;
    [inputShareSeed, encoded] = split(encoded, prg.seedSize);
    [proofShareSeed, encoded] = split(encoded, prg.seedSize);

    const inputShare = await this.pseudorandom(flp.inputLen, inputShareSeed, j);
    const proofShare = await this.pseudorandom(flp.proofLen, proofShareSeed, j);

    let blind = null;
    let hint = null;
    if (flp.jointRandLen > 0) {
      [blind, encoded] = split(encoded, prg.seedSize);
      [hint, encoded] = split(encoded, prg.seedSize);
    }

    if (encoded.length) {
      throw new Error("unused bytes in decoding helper share");
    }

    return { inputShare, proofShare, blind, hint };
  }
}

export class Prio3Aes128Count extends Prio3<number> {
  constructor(shares: number) {
    super(PrgAes128, new FlpGeneric(new Count()), shares);
  }
}

export class Prio3Aes128Histogram extends Prio3<number> {
  constructor(shares: number, buckets: number[]) {
    super(PrgAes128, new FlpGeneric(new Histogram(buckets)), shares);
  }
}

export class Prio3Aes128Sum extends Prio3<number> {
  constructor(shares: number, bits: number) {
    super(PrgAes128, new FlpGeneric(new Sum(bits)), shares);
  }
}
