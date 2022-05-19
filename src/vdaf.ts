/** @internal */
export const VDAF_VERSION = "vdaf-00";

export interface Vdaf<
  Measurement,
  AggregationParameter,
  PrepareMessage,
  AggregatorShare,
  AggregationResult,
  OutputShare
> {
  shares: number;
  rounds: number;
  verifyKeySize: number;

  measurementToInputShares(measurement: Measurement): Promise<Buffer[]>;

  initialPrepareMessage(
    verifyKey: Buffer,
    aggId: number,
    aggParam: AggregationParameter,
    nonce: Buffer,
    inputShare: Buffer
  ): Promise<PrepareMessage>;

  prepareNext(
    prepareMessage: PrepareMessage,
    inbound: Buffer | null
  ):
    | { prepareMessage: PrepareMessage; prepareShare: Buffer }
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
