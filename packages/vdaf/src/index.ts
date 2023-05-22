import { arr, randomBytes, zip } from "@divviup/common";
import { Buffer } from "buffer";

/** @internal */
export const VDAF_VERSION_NUMBER = 5;
export const VDAF_VERSION = "vdaf-05";

export type Shares = {
  publicShare: Buffer;
  inputShares: Buffer[];
};

export abstract class Vdaf<
  Measurement,
  AggregationParameter,
  PrepareState,
  AggregatorShare,
  AggregationResult,
  OutputShare
> {
  abstract id: number;
  abstract shares: number;
  abstract rounds: number;
  abstract verifyKeySize: number;
  abstract nonceSize: number;
  abstract randSize: number;

  abstract measurementToInputShares(
    measurement: Measurement,
    nonce: Buffer,
    rand: Buffer
  ): Promise<Shares>;

  abstract initialPrepareState(
    verifyKey: Buffer,
    aggId: number,
    aggParam: AggregationParameter,
    nonce: Buffer,
    publicShare: Buffer,
    inputShare: Buffer
  ): Promise<PrepareState>;

  abstract prepareNext(
    prepareState: PrepareState,
    inbound: Buffer | null
  ):
    | { prepareState: PrepareState; prepareShare: Buffer }
    | { outputShare: OutputShare };

  abstract prepSharesToPrepareMessage(
    aggParam: AggregationParameter,
    prepShares: Buffer[]
  ): Promise<Buffer>;

  abstract outputSharesToAggregatorShare(
    aggParam: AggregationParameter,
    outShares: OutputShare[]
  ): AggregatorShare;

  abstract aggregatorSharesToResult(
    aggParam: AggregationParameter,
    aggShares: AggregatorShare[],
    measurementCount: number
  ): AggregationResult;

  domainSeparationTag(usage: number): Buffer {
    return formatDomainSeparationTag(0, this.id, usage);
  }

  run({
    aggregationParameter,
    verifyKey,
    nonces,
    measurements,
  }: {
    aggregationParameter: AggregationParameter;
    measurements: Measurement[];
    verifyKey?: Buffer;
    nonces?: Buffer[];
  }): Promise<
    TestVector<
      AggregationParameter,
      Measurement,
      OutputShare,
      AggregatorShare,
      AggregationResult
    >
  > {
    return runVdaf({
      vdaf: this,
      verifyKey,
      aggregationParameter,
      nonces,
      measurements,
    });
  }

  async test(
    aggregationParameter: AggregationParameter,
    measurements: Measurement[]
  ): Promise<AggregationResult> {
    return (await this.run({ aggregationParameter, measurements })).agg_result;
  }
}

export interface ClientVdaf<Measurement> {
  shares: number;
  rounds: number;
  randSize: number;
  nonceSize: number;

  measurementToInputShares(
    measurement: Measurement,
    nonce: Buffer,
    rand: Buffer
  ): Promise<Shares>;
}

function hex(b: Buffer): string {
  return b.toString("hex");
}

interface RunVdafArguments<M, AP, P, AS, AR, OS> {
  vdaf: Vdaf<M, AP, P, AS, AR, OS>;
  aggregationParameter: AP;
  measurements: M[];
  verifyKey?: Buffer;
  nonces?: Buffer[];
}

export async function runVdaf<M, AP, P, AS, AR, OS>(
  args: RunVdafArguments<M, AP, P, AS, AR, OS>
): Promise<TestVector<AP, M, OS, AS, AR>> {
  const { vdaf, aggregationParameter, measurements } = args;
  const nonces =
    args.nonces ||
    measurements.map((_) => Buffer.from(randomBytes(vdaf.nonceSize)));
  const verifyKey =
    args.verifyKey || Buffer.from(randomBytes(vdaf.verifyKeySize));

  const testVector: Omit<TestVector<AP, M, OS, AS, AR>, "agg_result"> = {
    agg_param: aggregationParameter,
    agg_shares: [] as AS[],
    prep: [],
    verify_key: hex(Buffer.from(verifyKey)),
  };

  const outShares = await Promise.all(
    zip(measurements, nonces).map(async ([measurement, nonce]) => {
      const rand = Buffer.from(randomBytes(vdaf.randSize));
      const { publicShare, inputShares } = await vdaf.measurementToInputShares(
        measurement,
        nonce,
        rand
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

      prepTestVector.out_shares = prepStates.map((state) => {
        const out = vdaf.prepareNext(state, inbound);
        if (!("outputShare" in out)) {
          throw new Error("expected outputShare for the last share");
        }
        return out.outputShare;
      });
      testVector.prep.push(prepTestVector);
      return prepTestVector.out_shares;
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

  const agg_result = vdaf.aggregatorSharesToResult(
    aggregationParameter,
    aggregatorShares,
    measurements.length
  );

  return { ...testVector, agg_result };
}

export interface TestVector<AP, M, OS, AS, AR> {
  verify_key: string;
  agg_param: AP;
  prep: PrepTestVector<M, OS>[];
  agg_shares: AS[];
  agg_result: AR;
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

export function formatDomainSeparationTag(
  algorithmClass: number,
  algorithm: number,
  usage: number
): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt8(VDAF_VERSION_NUMBER, 0);
  buffer.writeUInt8(algorithmClass, 1);
  buffer.writeUInt32BE(algorithm, 2);
  buffer.writeUInt16BE(usage, 6);
  return buffer;
}
