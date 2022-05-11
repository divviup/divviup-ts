import { Vdaf } from "vdaf";
import { PrgAes128, PrgConstructor } from "prng";
import { VERSION, arr, randomBytes } from "common";
import { Vector } from "field";
import { FlpGeneric } from "prio3/genericFlp";
import { Count } from "prio3/circuits/count";
import { Histogram } from "prio3/circuits/histogram";
import { Flp } from "prio3/flp";
import { Sum } from "prio3/circuits/sum";

type Prep = {
  outputShare: OutShare;
  kJointRand: Buffer | null;
  outboundMessage: Buffer;
};
type PublicParam = null;
type VerifyParam = [number, Buffer]; /// THIS IS DIFFERENT
type AggParam = null;
type AggShare = Vector;
type AggResult = number[];
type OutShare = Vector;
type PrioVdaf<Measurement> = Vdaf<
  Measurement,
  PublicParam,
  VerifyParam,
  AggParam,
  Prep,
  AggShare,
  AggResult,
  OutShare
>;

interface Share {
  inputShare: Vector;
  proofShare: Vector;
  kBlind: Buffer | null;
  kHint: Buffer | null;
}

export class Prio3<Measurement> implements PrioVdaf<Measurement> {
  rounds = 1;
  prg: PrgConstructor;
  flp: Flp<Measurement>;
  shares: number;
  constructor(prg: PrgConstructor, flp: Flp<Measurement>, shares: number) {
    this.prg = prg;
    this.flp = flp;
    this.shares = shares;
  }
  setup(): [PublicParam, VerifyParam[]] {
    const kQueryInit = randomBytes(this.prg.seedSize);
    const verifyParam = arr(
      this.shares,
      (j) => [j, kQueryInit] as [number, Buffer]
    );
    return [null, verifyParam];
  }

  async measurementToInputShares(
    _publicParam: PublicParam,
    measurement: Measurement
  ): Promise<Buffer[]> {
    const dst = Buffer.from(`${VERSION} prio3`, "ascii");
    const input = this.flp.encode(measurement);
    const { field } = this.flp;
    const { seedSize } = this.prg;
    let kJointRand = Buffer.alloc(seedSize);

    let leaderInputShare = input;
    const kHelperInputShares: Buffer[] = [];
    const kHelperBlinds: Buffer[] = [];
    const kHelperHints: Buffer[] = [];
    for (let j = 0; j < this.shares - 1; j++) {
      const kBlind = randomBytes(seedSize);
      const kShare = randomBytes(seedSize);
      const helperInputShare = await this.prg.expandIntoVec(
        this.flp.field,
        kShare,
        Buffer.from([...dst, j + 1]),
        this.flp.inputLen
      );

      leaderInputShare = field.vecSub(leaderInputShare, helperInputShare);

      const encoded = field.encode(helperInputShare);

      const kHint = await this.prg.deriveSeed(
        kBlind,
        Buffer.concat([new Uint8Array([j + 1]), encoded])
      );

      kJointRand = xorWith(kJointRand, kHint);
      kHelperInputShares.push(kShare);
      kHelperBlinds.push(kBlind);
      kHelperHints.push(kHint);
    }

    const kLeaderBlind = randomBytes(seedSize);
    const encoded = field.encode(leaderInputShare);
    let kLeaderHint = await this.prg.deriveSeed(
      kLeaderBlind,
      Buffer.concat([new Uint8Array([0]), encoded])
    );
    kJointRand = xorWith(kJointRand, kLeaderHint);

    for (let j = 0; j < this.shares - 1; j++) {
      kHelperHints[j] = xorWith(kHelperHints[j], kJointRand);
    }
    kLeaderHint = xorWith(kLeaderHint, kJointRand);

    const proveRand = await this.prg.expandIntoVec(
      field,
      randomBytes(seedSize),
      dst,
      this.flp.proveRandLen
    );

    const jointRand = await this.prg.expandIntoVec(
      field,
      kJointRand,
      dst,
      this.flp.jointRandLen
    );

    const proof = this.flp.prove(input, proveRand, jointRand);
    let leaderProofShare = proof;
    const kHelperProofShares: Buffer[] = [];
    for (let j = 0; j < this.shares - 1; j++) {
      const kShare = randomBytes(seedSize);
      kHelperProofShares.push(kShare);
      const helperProofShare = await this.prg.expandIntoVec(
        field,
        kShare,
        Buffer.from([...dst, j + 1]),
        this.flp.proofLen
      );
      leaderProofShare = field.vecSub(leaderProofShare, helperProofShare);
    }

    return [
      this.encodeShare({
        inputShare: leaderInputShare,
        proofShare: leaderProofShare,
        kBlind: kLeaderBlind,
        kHint: kLeaderHint,
      }),
      ...arr(this.shares - 1, (j) =>
        this.encodeShare({
          inputShare: kHelperInputShares[j],
          proofShare: kHelperProofShares[j],
          kBlind: kHelperBlinds[j],
          kHint: kHelperHints[j],
        })
      ),
    ];
  }

  decodeLeaderShare(encoded: Buffer): Share {
    let encodedInputShare: Buffer;
    [encodedInputShare, encoded] = split(
      encoded,
      this.flp.field.encodedSize * this.flp.inputLen
    );
    const inputShare = this.flp.field.decode(encodedInputShare);

    let encodedProofShare: Buffer;
    [encodedProofShare, encoded] = split(
      encoded,
      this.flp.field.encodedSize * this.flp.proofLen
    );
    const proofShare = this.flp.field.decode(encodedProofShare);

    let kBlind: Buffer | null = null;
    let kHint: Buffer | null = null;

    if (this.flp.jointRandLen > 0) {
      [kBlind, encoded] = split(encoded, this.prg.seedSize);
      [kHint, encoded] = split(encoded, this.prg.seedSize);
    }

    if (encoded.length) {
      throw new Error("unexpected extra leader share bytes");
    }

    return { inputShare, proofShare, kBlind, kHint };
  }

  encodeShare({
    inputShare,
    proofShare,
    kBlind,
    kHint,
  }: {
    inputShare: Buffer | Vector;
    proofShare: Buffer | Vector;
    kBlind: Buffer | null;
    kHint: Buffer | null;
  }): Buffer {
    const encodedParts = [
      Buffer.isBuffer(inputShare)
        ? inputShare
        : this.flp.field.encode(inputShare),

      Buffer.isBuffer(proofShare)
        ? proofShare
        : this.flp.field.encode(proofShare),
    ];
    if (this.flp.jointRandLen > 0 && kBlind && kHint) {
      encodedParts.push(kBlind);
      encodedParts.push(kHint);
    }
    return Buffer.concat(encodedParts);
  }

  async decodeHelperShare(
    dst: Buffer,
    j: number,
    encoded: Buffer
  ): Promise<Share> {
    let kInputShare;
    [kInputShare, encoded] = split(encoded, this.prg.seedSize);
    const inputShare = await this.prg.expandIntoVec(
      this.flp.field,
      kInputShare,
      Buffer.from([...dst, j]),
      this.flp.inputLen
    );

    let kProofShare;
    [kProofShare, encoded] = split(encoded, this.prg.seedSize);
    const proofShare = await this.prg.expandIntoVec(
      this.flp.field,
      kProofShare,
      Buffer.from([...dst, j]),
      this.flp.proofLen
    );

    let kBlind = null;
    let kHint = null;
    if (this.flp.jointRandLen > 0) {
      [kBlind, encoded] = split(encoded, this.prg.seedSize);
      [kHint, encoded] = split(encoded, this.prg.seedSize);
    }

    if (encoded.length) {
      throw new Error("unused bytes in decoding helper share");
    }

    return { inputShare, proofShare, kBlind, kHint };
  }

  async prepInit(
    verifyParam: VerifyParam,
    _aggParam: AggParam,
    nonce: Buffer,
    inputShare: Buffer
  ): Promise<Prep> {
    const dst = `${VERSION} prio3`;
    const [j, kQueryInit] = verifyParam;
    const share = await this.decodeShare(
      Buffer.from(dst, "ascii"),
      j,
      inputShare
    );

    const outputShare = this.flp.truncate(share.inputShare);

    const kQueryRand = await this.prg.deriveSeed(
      kQueryInit,
      Buffer.from([255, ...nonce])
    );

    const queryRand = await this.prg.expandIntoVec(
      this.flp.field,
      kQueryRand,
      Buffer.from(dst),
      this.flp.queryRandLen
    );

    let jointRand: Vector;
    let kJointRand: Buffer | null;
    let kJointRandShare: Buffer | null;
    if (this.flp.jointRandLen > 0 && share.kBlind && share.kHint) {
      const encoded = this.flp.field.encode(share.inputShare);
      kJointRandShare = await this.prg.deriveSeed(
        share.kBlind,
        Buffer.from([j, ...encoded])
      );
      kJointRand = xorWith(share.kHint, kJointRandShare);
      jointRand = await this.prg.expandIntoVec(
        this.flp.field,
        kJointRand,
        Buffer.from(dst),
        this.flp.jointRandLen
      );
    } else {
      jointRand = this.flp.field.vec([]);
      kJointRand = null;
      kJointRandShare = null;
    }

    const verifierShare = this.flp.query(
      share.inputShare,
      share.proofShare,
      queryRand,
      jointRand,
      this.shares
    );

    const outboundMessage = this.encodePrepareMessage(
      verifierShare,
      kJointRandShare
    );

    return { outputShare, kJointRand, outboundMessage };
  }

  prepNext(
    prep: Prep,
    inbound: Buffer | null
  ): { prep: Prep; prepMessage: Buffer } | { outShare: OutShare } {
    if (!inbound) {
      return { prep, prepMessage: prep.outboundMessage };
    }

    const { verifier, kJointRand } = this.decodePrepareMessage(inbound);

    const kJointRandEquality =
      (kJointRand &&
        prep.kJointRand &&
        0 === Buffer.compare(kJointRand, prep.kJointRand)) ||
      kJointRand === prep.kJointRand; // both null

    if (!kJointRandEquality || !this.flp.decide(verifier)) {
      throw new Error("Verify error");
    }

    return { outShare: prep.outputShare };
  }

  async decodeShare(dst: Buffer, j: number, encoded: Buffer): Promise<Share> {
    return j == 0
      ? this.decodeLeaderShare(encoded)
      : await this.decodeHelperShare(dst, j, encoded);
  }

  decodePrepareMessage(input: Buffer): {
    verifier: Vector;
    kJointRand: Buffer | null;
  } {
    // eslint-disable-next-line prefer-const
    let [encodedVerifier, encoded] = split(
      input,
      this.flp.field.encodedSize * this.flp.verifierLen
    );

    const verifier = this.flp.field.decode(encodedVerifier);

    let kJointRand: null | Buffer = null;
    if (this.flp.jointRandLen > 0) {
      [kJointRand, encoded] = split(encoded, this.prg.seedSize);
    }

    if (encoded.length) {
      throw new Error("unused bytes at end of prepare message");
    }

    return { verifier, kJointRand };
  }

  prepSharesToPrep(_aggParam: AggParam, prepShares: Buffer[]): Buffer {
    let verifier = this.flp.field.vec(arr(this.flp.verifierLen, () => 0n));
    let kJointRandCheck = Buffer.alloc(this.prg.seedSize);

    for (const encoded of prepShares) {
      const { verifier: shareVerifier, kJointRand: kJointRandShare } =
        this.decodePrepareMessage(encoded);

      verifier = this.flp.field.vecAdd(verifier, shareVerifier);

      if (this.flp.jointRandLen > 0 && kJointRandShare) {
        kJointRandCheck = xorWith(kJointRandCheck, kJointRandShare);
      }
    }

    return this.encodePrepareMessage(verifier, kJointRandCheck);
  }

  outSharesToAggShare(_aggParam: AggParam, outShares: OutShare[]): AggShare {
    return outShares.reduce(
      (agg, share) => this.flp.field.vecAdd(agg, share),
      this.flp.field.vec(this.flp.outputLen)
    );
  }

  aggSharesToResult(_aggParam: AggParam, aggShares: AggShare[]): AggResult {
    return aggShares
      .reduce(
        (agg, share) => this.flp.field.vecAdd(agg, share),
        this.flp.field.vec(this.flp.outputLen)
      )
      .toValues()
      .map(Number);
  }

  testVectorVerifyParams(verifyParams: VerifyParam[]): [number, string][] {
    return verifyParams.map(([j, kQueryInit]) => [
      j,
      kQueryInit.toString("hex"),
    ]);
  }

  encodePrepareMessage(
    verifier: Vector,
    kJointRandShares: Buffer | null
  ): Buffer {
    const verifierEncoded = this.flp.field.encode(verifier);
    if (this.flp.jointRandLen > 0 && kJointRandShares) {
      return Buffer.concat([verifierEncoded, kJointRandShares]);
    } else {
      return verifierEncoded;
    }
  }
}

function xorWith(a: Buffer, b: Buffer) {
  const returnBuffer = Buffer.alloc(Math.min(a.length, b.length));
  for (let i = 0; i < returnBuffer.length; i++) {
    returnBuffer[i] = a[i] ^ b[i];
  }
  return returnBuffer;
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

function split<T extends { slice(start: number, end?: number): T }>(
  sliceable: T,
  index: number
): [T, T] {
  return [sliceable.slice(0, index), sliceable.slice(index)];
}
