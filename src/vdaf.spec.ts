import { Field128, Vector } from "field";
import { Vdaf } from "vdaf";
import assert from "assert";
import { arr, randomBytes, zip } from "common";
import util from "util";

type PrepareMessage = {
  inputRange: { min: number; max: number };
  encodedInputShare: Buffer;
};
type AggregationParameter = null;
type AggregatorShare = Vector;
type OutputShare = Vector;
type AggregationResult = number;
type Measurement = number;
type TestVdaf = Vdaf<
  Measurement,
  AggregationParameter,
  PrepareMessage,
  AggregatorShare,
  AggregationResult,
  OutputShare
>;

export async function testVdaf<M, AP, P, AS, AR, OS>(
  vdaf: Vdaf<M, AP, P, AS, AR, OS>,
  aggParam: AP,
  measurements: M[],
  expectedAggResult: AR,
  print = false
) {
  const nonces = measurements.map((_) => randomBytes(16));
  const aggResult = await runVdaf(vdaf, aggParam, nonces, measurements, print);
  assert.deepEqual(aggResult, expectedAggResult);
}

interface TestVector<AP, M, OS, AS, AR> {
  verify_key: string;
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

export class VdafTest implements TestVdaf {
  field = Field128;
  shares = 2;
  rounds = 1;
  inputRange = { min: 0, max: 5 };
  verifyKeySize = 0;

  measurementToInputShares(measurement: Measurement): Promise<Buffer[]> {
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

  initialPrepareMessage(
    _verifyKey: Buffer,
    _aggregatorId: number,
    _aggParam: AggregationParameter,
    _nonce: Buffer,
    inputShare: Buffer
  ): Promise<PrepareMessage> {
    return Promise.resolve({
      inputRange: this.inputRange,
      encodedInputShare: inputShare,
    });
  }

  prepareNext(
    prepareMessage: PrepareMessage,
    inbound: Buffer | null
  ):
    | { prepareMessage: PrepareMessage; prepareShare: Buffer }
    | { outputShare: Vector } {
    if (!inbound) {
      return { prepareMessage, prepareShare: prepareMessage.encodedInputShare };
    }

    const measurement = Number(this.field.decode(inbound).getValue(0));
    const { min, max } = this.inputRange;
    if (measurement <= min || measurement > max) {
      throw new Error(`measurement ${measurement} was not in [${min}, ${max})`);
    }

    return { outputShare: this.field.decode(prepareMessage.encodedInputShare) };
  }

  prepSharesToPrepareMessage(
    _aggParam: AggregationParameter,
    prepShares: Buffer[]
  ): Buffer {
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

  outputSharesToAggregatorShare(_aggParam: null, outShares: Vector[]): Vector {
    return this.field.vec([
      outShares.reduce((x, y) => this.field.add(x, y.getValue(0)), 0n),
    ]);
  }

  aggregatorSharesToResult(
    _aggParam: AggregationParameter,
    aggShares: AggregatorShare[]
  ): AggregationResult {
    return Number(
      aggShares.reduce((x, y) => this.field.add(x, y.getValue(0)), 0n)
    );
  }
}

describe("test vdaf", () => {
  it("behaves as expected", async () => {
    await testVdaf(new VdafTest(), null, [1, 2, 3, 4], 10);
  });
});

export async function runVdaf<M, AP, P, AS, AR, OS>(
  vdaf: Vdaf<M, AP, P, AS, AR, OS>,
  aggregationParameter: AP,
  nonces: Buffer[],
  measurements: M[],
  print = false
): Promise<AR> {
  const verifyKey = randomBytes(vdaf.verifyKeySize);

  const testVector: TestVector<AP, M, OS, AS, AR> = {
    verify_key: verifyKey.toString("hex"),
    agg_param: aggregationParameter,
    prep: [],
    agg_shares: [],
  };

  const outShares = await Promise.all(
    zip(measurements, nonces).map(async ([measurement, nonce]) => {
      const prepTestVector: PrepTestVector<M, OS> = {
        measurement,
        nonce: nonce.toString("hex"),
        input_shares: [],
        prep_shares: arr(vdaf.rounds, () => []),
        out_shares: [],
      };

      const inputShares = await vdaf.measurementToInputShares(measurement);

      for (const share of inputShares) {
        prepTestVector.input_shares.push(share.toString("hex"));
      }

      const prepStates: P[] = await Promise.all(
        arr(vdaf.shares, (aggregatorId) =>
          vdaf.initialPrepareMessage(
            verifyKey,
            aggregatorId,
            aggregationParameter,
            nonce,
            inputShares[aggregatorId]
          )
        )
      );

      let inbound: Buffer | null = null;
      for (let round = 0; round < vdaf.rounds; round++) {
        const outbound: Buffer[] = prepStates.map(
          (state, aggregatorId, states) => {
            const out = vdaf.prepareNext(state, inbound);
            if (!("prepareMessage" in out) || !("prepareShare" in out)) {
              throw new Error("expected prepareMessage and prepareShare");
            }
            states[aggregatorId] = out.prepareMessage;
            return out.prepareShare;
          }
        );

        for (const prepShare of outbound) {
          prepTestVector.prep_shares[round].push(prepShare.toString("hex"));
        }

        inbound = vdaf.prepSharesToPrepareMessage(
          aggregationParameter,
          outbound
        );
      }

      const outbound = prepStates.map((state) => {
        const out = vdaf.prepareNext(state, inbound);
        if (!("outputShare" in out)) {
          throw new Error("expected outputShare for the last share");
        }
        return out.outputShare;
      });

      for (const outShare of outbound) {
        prepTestVector.out_shares.push(outShare);
      }

      testVector.prep.push(prepTestVector);
      return outbound;
    })
  );

  const aggregatorShares = arr(vdaf.shares, (aggregatorId) => {
    const aggregatorOutShares = outShares.reduce(
      (aggregatorOutShares, out) => [...aggregatorOutShares, out[aggregatorId]],
      [] as OS[]
    );

    const aggregatorShare = vdaf.outputSharesToAggregatorShare(
      aggregationParameter,
      aggregatorOutShares
    );

    testVector.agg_shares.push(aggregatorShare);
    return aggregatorShare;
  });

  const aggregationResult = vdaf.aggregatorSharesToResult(
    aggregationParameter,
    aggregatorShares
  );

  testVector.agg_result = aggregationResult;

  if (print && process.env.TEST_VECTOR) {
    console.log(util.inspect(testVector, { depth: null }));
  }

  return aggregationResult;
}
