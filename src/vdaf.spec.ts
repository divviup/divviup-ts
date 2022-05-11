import { Field128, Vector } from "field";
import { Vdaf } from "vdaf";
import assert from "assert";
import { arr, randomBytes } from "common";
import util from "util";

type Prep = {
  inputRange: { min: number; max: number };
  encodedInputShare: Buffer;
};
type PublicParam = null;
type VerifyParam = null;
type AggParam = null;
type AggShare = Vector;
type OutShare = Vector;
type AggResult = number;
type Measurement = number;
type TheVdaf = Vdaf<
  Measurement,
  PublicParam,
  VerifyParam,
  AggParam,
  Prep,
  AggShare,
  AggResult,
  OutShare
>;

export async function testVdaf<M, PP, VP, AP, P, AS, AR, OS>(
  vdaf: Vdaf<M, PP, VP, AP, P, AS, AR, OS>,
  aggParam: AP,
  measurements: M[],
  expectedAggResult: AR,
  print = false
) {
  const nonces = measurements.map((_) => randomBytes(16));
  const aggResult = await runVdaf(vdaf, aggParam, nonces, measurements, print);
  assert.deepEqual(aggResult, expectedAggResult);
}

interface TestVector<PP, AP, M, OS, AS, AR> {
  public_param: PP;
  verify_params: [number, string][];
  agg_param: AP;
  prep: PrepTestVector<M, OS>[];
  agg_shares: AS[];
  agg_result?: AR;
}

interface PrepTestVector<M, OS> {
  measurement: M;
  nonce: string;
  input_shares: string[];
  prep_shares: string[][];
  out_shares: OS[];
}

export class VdafTest implements TheVdaf {
  field = Field128;
  shares = 2;
  rounds = 1;
  inputRange = { min: 0, max: 5 };

  setup(): [PublicParam, VerifyParam[]] {
    return [null, arr(this.shares, () => null)];
  }

  measurementToInputShares(
    _publicParam: PublicParam,
    measurement: Measurement
  ): Promise<Buffer[]> {
    const { field } = this;
    const helperShares = field.fillRandom(this.shares - 1).toValues();

    const leaderShare = helperShares.reduce(
      (ls, hs) => field.sub(ls, hs),
      BigInt(measurement)
    );

    return Promise.resolve([
      field.encode(field.vec([leaderShare])),
      ...helperShares.map((hs) => field.encode(field.vec([hs]))),
    ]);
  }

  prepInit(
    _verifyParam: VerifyParam,
    _aggParam: AggParam,
    _nonce: Buffer,
    inputShare: Buffer
  ): Promise<Prep> {
    return Promise.resolve({
      inputRange: this.inputRange,
      encodedInputShare: inputShare,
    });
  }

  prepNext(
    prep: Prep,
    inbound: Buffer | null
  ): { prep: Prep; prepMessage: Buffer } | { outShare: Vector } {
    if (!inbound) {
      return { prep: prep, prepMessage: prep.encodedInputShare };
    }

    const measurement = Number(this.field.decode(inbound).getValue(0));
    const { min, max } = this.inputRange;
    if (measurement <= min || measurement > max) {
      throw new Error(`measurement ${measurement} was not in [${min}, ${max})`);
    }

    return { outShare: this.field.decode(prep.encodedInputShare) };
  }

  prepSharesToPrep(_aggParam: AggParam, prepShares: Buffer[]): Buffer {
    const { field } = this;
    return field.encode(
      field.vec([
        prepShares.reduce(
          (sum, encoded) => field.add(sum, field.decode(encoded).getValue(0)),
          0n
        ),
      ])
    );
  }

  outSharesToAggShare(_aggParam: null, outShares: Vector[]): Vector {
    return this.field.vec([
      outShares.reduce((x, y) => this.field.add(x, y.getValue(0)), 0n),
    ]);
  }

  aggSharesToResult(_aggParam: AggParam, aggShares: AggShare[]): AggResult {
    return Number(
      aggShares.reduce((x, y) => this.field.add(x, y.getValue(0)), 0n)
    );
  }

  testVectorVerifyParams(_verifyParams: VerifyParam[]): [number, string][] {
    return [];
  }
}

describe("test vdaf", () => {
  it("behaves as expected", async () => {
    await testVdaf(new VdafTest(), null, [1, 2, 3, 4], 10);
  });
});

export async function runVdaf<M, PP, VP, AP, P, AS, AR, OS>(
  vdaf: Vdaf<M, PP, VP, AP, P, AS, AR, OS>,
  aggParam: AP,
  nonces: Buffer[],
  measurements: M[],
  print = false
): Promise<AR> {
  const [publicParam, verifyParams] = vdaf.setup();

  const testVector: TestVector<PP, AP, M, OS, AS, AR> = {
    public_param: publicParam,
    verify_params: vdaf.testVectorVerifyParams(verifyParams),
    agg_param: aggParam,
    prep: [],
    agg_shares: [],
  };

  const outShares = [];
  for (let m = 0; m < measurements.length; m++) {
    const measurement = measurements[m];
    const nonce = nonces[m];
    const prepTestVector: PrepTestVector<M, OS> = {
      measurement,
      nonce: nonce.toString("hex"),
      input_shares: [],
      prep_shares: arr(vdaf.rounds, () => []),
      out_shares: [],
    };

    const inputShares = await vdaf.measurementToInputShares(
      publicParam,
      measurement
    );

    for (const share of inputShares) {
      prepTestVector.input_shares.push(share.toString("hex"));
    }

    const prepStates: P[] = await Promise.all(
      arr(vdaf.shares, (j) =>
        vdaf.prepInit(verifyParams[j], aggParam, nonce, inputShares[j])
      )
    );

    let inbound: Buffer | null = null;
    for (let i = 0; i < vdaf.rounds; i++) {
      const outbound: Buffer[] = prepStates.map((state, j, states) => {
        const out = vdaf.prepNext(state, inbound);
        if (!("prep" in out) || !("prepMessage" in out)) {
          throw new Error("expected prep and prepMessage");
        }
        states[j] = out.prep;
        return out.prepMessage;
      });

      for (const prepShare of outbound) {
        prepTestVector.prep_shares[i].push(prepShare.toString("hex"));
      }

      inbound = vdaf.prepSharesToPrep(aggParam, outbound);
    }

    const outbound = prepStates.map((state) => {
      const out = vdaf.prepNext(state, inbound);
      if (!("outShare" in out)) {
        throw new Error("expected outShare for the last share");
      }
      return out.outShare;
    });

    for (const outShare of outbound) {
      prepTestVector.out_shares.push(outShare);
    }

    outShares.push(outbound);
    testVector.prep.push(prepTestVector);
  }

  const aggShares = [];
  for (let j = 0; j < vdaf.shares; j++) {
    const outSharesJ = outShares.reduce(
      (osjs, out) => [...osjs, out[j]],
      [] as OS[]
    );

    const aggShareJ = vdaf.outSharesToAggShare(aggParam, outSharesJ);
    aggShares.push(aggShareJ);
    testVector.agg_shares.push(aggShareJ);
  }

  const aggResult = vdaf.aggSharesToResult(aggParam, aggShares);
  testVector.agg_result = aggResult;

  if (print && process.env.TEST_VECTOR) {
    console.log(util.inspect(testVector, { depth: null }));
  }
  return aggResult;
}
