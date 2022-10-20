import { arr, randomBytes, zip } from "@divviup/common";
import assert from "assert";
import { Buffer } from "buffer";

/** @internal */
export const VDAF_VERSION = "vdaf-03";

export interface Vdaf<
  Measurement,
  AggregationParameter,
  PrepareState,
  AggregatorShare,
  AggregationResult,
  OutputShare
> {
  shares: number;
  rounds: number;
  verifyKeySize: number;

  measurementToInputShares(measurement: Measurement): Promise<Buffer[]>;

  initialPrepareState(
    verifyKey: Buffer,
    aggId: number,
    aggParam: AggregationParameter,
    nonce: Buffer,
    inputShare: Buffer
  ): Promise<PrepareState>;

  prepareNext(
    prepareState: PrepareState,
    inbound: Buffer | null
  ):
    | { prepareState: PrepareState; prepareShare: Buffer }
    | { outputShare: OutputShare };

  prepSharesToPrepareMessage(
    aggParam: AggregationParameter,
    prepShares: Buffer[]
  ): Buffer;

  outputSharesToAggregatorShare(
    aggParam: AggregationParameter,
    outShares: OutputShare[]
  ): AggregatorShare;

  aggregatorSharesToResult(
    aggParam: AggregationParameter,
    aggShares: AggregatorShare[]
  ): AggregationResult;
}

export interface ClientVdaf<Measurement> {
  shares: number;
  rounds: number;

  measurementToInputShares(measurement: Measurement): Promise<Buffer[]>;
}

export async function testVdaf<M, AP, P, AS, AR, OS>(
  vdaf: Vdaf<M, AP, P, AS, AR, OS>,
  aggParam: AP,
  measurements: M[],
  expectedAggResult: AR,
  print = false
) {
  const nonces = measurements.map((_) => Buffer.from(randomBytes(16)));
  const aggResult = await runVdaf(vdaf, aggParam, nonces, measurements, print);
  assert.deepEqual(aggResult, expectedAggResult);
}

export async function runVdaf<M, AP, P, AS, AR, OS>(
  vdaf: Vdaf<M, AP, P, AS, AR, OS>,
  aggregationParameter: AP,
  nonces: Buffer[],
  measurements: M[],
  print = false
): Promise<AR> {
  const verifyKey = randomBytes(vdaf.verifyKeySize);

  const testVector: TestVector<AP, M, OS, AS, AR> = {
    verify_key: Buffer.from(verifyKey).toString("hex"),
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
          vdaf.initialPrepareState(
            Buffer.from(verifyKey),
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
            if (!("prepareState" in out) || !("prepareShare" in out)) {
              throw new Error("expected prepareState and prepareShare");
            }
            states[aggregatorId] = out.prepareState;
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

  if (print && "TEST_VECTOR" in globalThis) {
    console.log(testVector);
  }

  return aggregationResult;
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
