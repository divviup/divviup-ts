export interface Vdaf<
  Measurement,
  PublicParam,
  VerifyParam,
  AggParam,
  Prep,
  AggShare,
  AggResult,
  OutShare
> {
  shares: number;
  rounds: number;

  setup(): [PublicParam, VerifyParam[]];

  measurementToInputShares(
    publicParam: PublicParam,
    measurement: Measurement
  ): Promise<Buffer[]>;

  prepInit(
    verifyParam: VerifyParam,
    aggParam: AggParam,
    nonce: Buffer,
    inputShare: Buffer
  ): Promise<Prep>;

  prepNext(
    prep: Prep,
    inbound: Buffer | null
  ): { prep: Prep; prepMessage: Buffer } | { outShare: OutShare };

  prepSharesToPrep(aggParam: AggParam, prepShares: Buffer[]): Buffer;

  outSharesToAggShare(aggParam: AggParam, outShares: OutShare[]): AggShare;

  aggSharesToResult(aggParam: AggParam, aggShares: AggShare[]): AggResult;

  testVectorVerifyParams(verifyParams: VerifyParam[]): [number, string][];
}
