import { Field128 } from "@divviup/field";
import { Shares, Vdaf, testVdaf } from ".";

type PrepareState = {
  inputRange: { min: number; max: number };
  encodedInputShare: Buffer;
};
type AggregationParameter = null;
type AggregatorShare = Buffer;
type OutputShare = bigint[];
type AggregationResult = number[];
type Measurement = number;
type TestVdaf = Vdaf<
  Measurement,
  AggregationParameter,
  PrepareState,
  AggregatorShare,
  AggregationResult,
  OutputShare
>;

export class VdafTest implements TestVdaf {
  field = new Field128();
  shares = 2;
  rounds = 1;
  inputRange = { min: 0, max: 5 };
  verifyKeySize = 0;

  measurementToInputShares(measurement: Measurement): Promise<Shares> {
    const { field, shares } = this;
    const helperShares = field.fillRandom(shares - 1);

    const leaderShare = helperShares.reduce(
      (ls, hs) => field.sub(ls, hs),
      BigInt(measurement)
    );

    return Promise.resolve({
      publicShare: Buffer.from("dummy public share", "ascii"),
      inputShares: [
        Buffer.from(field.encode([leaderShare])),
        ...helperShares.map((hs) => Buffer.from(field.encode([hs]))),
      ],
    });
  }

  initialPrepareState(
    _verifyKey: Buffer,
    _aggregatorId: number,
    _aggParam: AggregationParameter,
    _nonce: Buffer,
    _publicShare: Buffer,
    inputShare: Buffer
  ): Promise<PrepareState> {
    return Promise.resolve({
      inputRange: this.inputRange,
      encodedInputShare: inputShare,
    });
  }

  prepareNext(
    prepareState: PrepareState,
    inbound: Buffer | null
  ):
    | { prepareState: PrepareState; prepareShare: Buffer }
    | { outputShare: bigint[] } {
    if (!inbound) {
      return { prepareState, prepareShare: prepareState.encodedInputShare };
    }

    const measurement = Number(this.field.decode(inbound)[0]);
    const { min, max } = this.inputRange;
    if (measurement <= min || measurement > max) {
      throw new Error(`measurement ${measurement} was not in [${min}, ${max})`);
    }

    return { outputShare: this.field.decode(prepareState.encodedInputShare) };
  }

  prepSharesToPrepareMessage(
    _aggParam: AggregationParameter,
    prepShares: Buffer[]
  ): Promise<Buffer> {
    const { field } = this;
    return Promise.resolve(
      Buffer.from(
        field.encode([
          field.sum(prepShares, (encoded) => field.decode(encoded)[0]),
        ])
      )
    );
  }

  outputSharesToAggregatorShare(
    _aggParam: null,
    outShares: bigint[][]
  ): Buffer {
    return Buffer.from(
      this.field.encode([this.field.sum(outShares, (share) => share[0])])
    );
  }

  aggregatorSharesToResult(
    _aggParam: AggregationParameter,
    aggShares: Buffer[]
  ): AggregationResult {
    return [
      Number(
        this.field.sum(aggShares, (aggShare) => this.field.decode(aggShare)[0])
      ),
    ];
  }
}

describe("test vdaf", () => {
  it("behaves as expected", async () => {
    await testVdaf(new VdafTest(), null, [1, 2, 3, 4], [10]);
  });
});
