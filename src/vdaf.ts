export interface Vdaf<
  Measurement,
  PublicParameter,
  VerifyParameter,
  AggregationParameter,
  PrepareMessage,
  AggregatorShare,
  AggregationResult,
  OutputShare
> {
  shares: number;
  rounds: number;

  setup(): [PublicParameter, VerifyParameter[]];

  measurementToInputShares(
    publicParam: PublicParameter,
    measurement: Measurement
  ): Promise<Buffer[]>;

  initialPrepareMessage(
    verifyParam: VerifyParameter,
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

  testVectorVerifyParams(verifyParams: VerifyParameter[]): [number, string][];
}

export interface ClientVdaf<Measurement, PublicParameter> {
  shares: number;
  rounds: number;

  measurementToInputShares(
    publicParam: PublicParameter,
    measurement: Measurement
  ): Promise<Buffer[]>;
}
