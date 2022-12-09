import { arr, randomBytes, zip } from "@divviup/common";
import assert from "assert";
import { Buffer } from "buffer";

/** @internal */
export const VDAF_VERSION = "vdaf-03";

export type Shares = {
  publicShare: Buffer;
  inputShares: Buffer[];
};

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

  measurementToInputShares(measurement: Measurement): Promise<Shares>;

  initialPrepareState(
    verifyKey: Buffer,
    aggId: number,
    aggParam: AggregationParameter,
    nonce: Buffer,
    publicShare: Buffer,
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
  ): Promise<Buffer>;

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

  measurementToInputShares(measurement: Measurement): Promise<Shares>;
}

export async function testVdaf<M, AP, P, AS, AR, OS>(
  vdaf: Vdaf<M, AP, P, AS, AR, OS>,
  aggParam: AP,
  measurements: M[],
  expectedAggResult: AR
) {
  const nonces = measurements.map((_) => Buffer.from(randomBytes(16)));
  const { agg_result } = await runVdaf(vdaf, aggParam, nonces, measurements);
  assert.deepEqual(agg_result, expectedAggResult);
}

function hex(b: Buffer): string {
  return b.toString("hex");
}

export async function runVdaf<M, AP, P, AS, AR, OS>(
  vdaf: Vdaf<M, AP, P, AS, AR, OS>,
  aggregationParameter: AP,
  nonces: Buffer[],
  measurements: M[]
): Promise<TestVector<AP, M, OS, AS, AR>> {
  const verifyKey = randomBytes(vdaf.verifyKeySize);

  const testVector: TestVector<AP, M, OS, AS, AR> = {
    agg_param: aggregationParameter,
    agg_result: undefined,
    agg_shares: [] as AS[],
    prep: [],
    verify_key: hex(Buffer.from(verifyKey)),
  };

  const outShares = await Promise.all(
    zip(measurements, nonces).map(async ([measurement, nonce]) => {
      const { publicShare, inputShares } = await vdaf.measurementToInputShares(
        measurement
      );

      const prepTestVector: PrepTestVector<M, OS> = {
        input_shares: inputShares.map(hex),
        measurement,
        nonce: hex(nonce),
        out_shares: [],
        prep_messages: [],
        prep_shares: arr(vdaf.rounds, () => []),
        public_share: hex(publicShare),
      };

      const prepStates: P[] = await Promise.all(
        arr(vdaf.shares, (aggregatorId) =>
          vdaf.initialPrepareState(
            Buffer.from(verifyKey),
            aggregatorId,
            aggregationParameter,
            nonce,
            publicShare,
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

        prepTestVector.prep_shares[round] = outbound.map(hex);

        inbound = await vdaf.prepSharesToPrepareMessage(
          aggregationParameter,
          outbound
        );

        prepTestVector.prep_messages = [hex(inbound)];
      }

      const outbound = prepStates.map((state) => {
        const out = vdaf.prepareNext(state, inbound);
        if (!("outputShare" in out)) {
          throw new Error("expected outputShare for the last share");
        }
        return out.outputShare;
      });

      prepTestVector.out_shares.push(...outbound);

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

  return testVector;
}

export interface TestVector<AP, M, OS, AS, AR> {
  verify_key: string;
  agg_param: AP;
  prep: PrepTestVector<M, OS>[];
  agg_shares: AS[];
  agg_result?: AR;
}

export interface PrepTestVector<M, OS> {
  input_shares: string[];
  measurement: M;
  nonce: string;
  out_shares: OS[];
  prep_messages: string[];
  prep_shares: string[][];
  public_share: string;
}
