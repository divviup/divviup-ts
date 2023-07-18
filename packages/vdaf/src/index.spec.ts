import { Field128 } from "@divviup/field";
import { Shares, Vdaf } from ".";
import { PrgSha3 } from "@divviup/prg";
import assert from "assert";

type PrepareState = {
  inputRange: { min: number; max: number };
  encodedInputShare: Buffer;
};
type AggregationParameter = null;
type AggregatorShare = Buffer;
type OutputShare = bigint[];
type AggregationResult = number;
type Measurement = number;

export class VdafTest extends Vdaf<
  Measurement,
  AggregationParameter,
  PrepareState,
  AggregatorShare,
  AggregationResult,
  OutputShare
> {
  field = new Field128();
  shares = 2;
  rounds = 1;
  inputRange = { min: 0, max: 5 };
  verifyKeySize = 0;
  id = 0xffffffff;
  randSize = 16;
  nonceSize = 0;

  async measurementToInputShares(
    measurement: Measurement,
    _nonce: Buffer,
    rand: Buffer,
  ): Promise<Shares> {
    const { field, shares } = this;
    const helperShares = await PrgSha3.expandIntoVec(
      field,
      rand,
      Buffer.alloc(0),
      Buffer.alloc(0),
      shares - 1,
    );
    const leaderShare = helperShares.reduce(
      (ls, hs) => field.sub(ls, hs),
      BigInt(measurement),
    );

    return Promise.resolve({
      publicShare: Buffer.from("dummy public share", "ascii"),
      inputShares: [leaderShare, ...helperShares].map((s) => {
        return Buffer.from(field.encode([s]));
      }),
    });
  }

  initialPrepareState(
    _verifyKey: Buffer,
    _aggregatorId: number,
    _aggParam: AggregationParameter,
    _nonce: Buffer,
    _publicShare: Buffer,
    inputShare: Buffer,
  ): Promise<PrepareState> {
    return Promise.resolve({
      inputRange: this.inputRange,
      encodedInputShare: inputShare,
    });
  }

  prepareNext(
    prepareState: PrepareState,
    inbound: Buffer | null,
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
    prepShares: Buffer[],
  ): Promise<Buffer> {
    const { field } = this;
    return Promise.resolve(
      Buffer.from(
        field.encode([
          field.sum(prepShares, (encoded) => field.decode(encoded)[0]),
        ]),
      ),
    );
  }

  outputSharesToAggregatorShare(
    _aggParam: null,
    outShares: bigint[][],
  ): Buffer {
    return Buffer.from(
      this.field.encode([this.field.sum(outShares, (share) => share[0])]),
    );
  }

  aggregatorSharesToResult(
    _aggParam: AggregationParameter,
    aggShares: Buffer[],
  ): AggregationResult {
    return Number(
      this.field.sum(aggShares, (aggShare) => this.field.decode(aggShare)[0]),
    );
  }
}

describe("test vdaf", () => {
  it("behaves as expected", async () => {
    const { agg_result } = await new VdafTest().run({
      aggregationParameter: null,
      measurements: [1, 2, 3, 4],
    });

    assert.deepEqual(agg_result, 10);
  });
});
