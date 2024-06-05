import { Prio3 } from "./index.js";
import assert from "assert";
import { Prio3Count, Prio3Histogram, Prio3Sum } from "./instantiations.js";
import { TestFlp128 } from "./flp.spec.js";
import { PrgSha3 } from "@divviup/prg";
import type { TestVector } from "@divviup/vdaf";
import { arr } from "@divviup/common";
import countTestVector0 from "./testVectors/Prio3Count_0.json" assert { type: "json" };
import histogramTestVector0 from "./testVectors/Prio3Histogram_0.json" assert { type: "json" };
import sumTestVector0 from "./testVectors/Prio3Sum_0.json" assert { type: "json" };

describe("prio3 vdaf", () => {
  it("test flp", async () => {
    const testFlp = new Prio3(PrgSha3, new TestFlp128(), 2, 255);
    assert.equal(await testFlp.test(null, [1, 2, 3, 4, 4]), 14);
  });

  it("count", async () => {
    const count = new Prio3Count({ shares: 2 });
    assert.equal(await count.test(null, [false, true, true, false, true]), 3);

    assert.equal(await count.test(null, [true]), 1);

    await assertPrio3TestVector(
      {
        ...countTestVector0,
        prep: countTestVector0.prep.map((prep) => ({
          ...prep,
          measurement: prep.measurement !== 0,
        })),
      },
      count,
    );
  });

  it("sum", async () => {
    const sum = new Prio3Sum({ shares: 2, bits: 8 });
    assert.equal(await sum.test(null, [0n, 147n, 1n, 0n, 11n, 0n]), 159);
    assert.equal(await sum.test(null, [100n]), 100);

    await assertPrio3TestVector(sumTestVector0, sum, { bits: sum.bits });
  });

  it("histogram", async () => {
    const histogram = new Prio3Histogram({
      shares: 2,
      buckets: [1, 10, 100],
    });
    assert.deepEqual(await histogram.test(null, [0]), [1, 0, 0, 0]);
    assert.deepEqual(await histogram.test(null, [5]), [0, 1, 0, 0]);
    assert.deepEqual(await histogram.test(null, [10]), [0, 1, 0, 0]);
    assert.deepEqual(await histogram.test(null, [15]), [0, 0, 1, 0]);
    assert.deepEqual(await histogram.test(null, [100]), [0, 0, 1, 0]);
    assert.deepEqual(await histogram.test(null, [101]), [0, 0, 0, 1]);
    assert.deepEqual(
      await histogram.test(null, [0, 1, 5, 10, 15, 100, 101, 101]),
      [2, 2, 2, 2],
    );
    assert.deepEqual(await histogram.test(null, [50]), [0, 0, 1, 0]);

    await assertPrio3TestVector(histogramTestVector0, histogram, {
      buckets: histogram.buckets,
    });
  });
});

type JsonTestVector<Measurement, AggregationResult> = TestVector<
  null,
  Measurement,
  string[],
  string,
  AggregationResult
>;

function deterministicRandom(length: number): Uint8Array {
  return Uint8Array.from(arr(length, (i) => i % 256));
}

async function runPrio3<M, AR>(
  instantiation: Prio3<M, AR>,
  measurements: M[],
  nonces: Buffer[],
  verifyKey: Buffer,
  rands: Buffer[],
): Promise<JsonTestVector<M, AR>> {
  const aggregationParameter = null;
  const testVector = await instantiation.run({
    aggregationParameter,
    nonces,
    measurements,
    verifyKey,
    rands,
  });
  const { field } = instantiation.flp;

  return {
    ...testVector,
    agg_shares: testVector.agg_shares.map((x) =>
      Buffer.from(field.encode(x)).toString("hex"),
    ),

    prep: testVector.prep.map((prep) => ({
      ...prep,
      out_shares: prep.out_shares.map((outShare) =>
        outShare.map((bigNumber) =>
          Buffer.from(field.encode([bigNumber])).toString("hex"),
        ),
      ),
    })),
  };
}

async function assertPrio3TestVector<
  Measurement,
  AggregationResult,
  TestVectorJson extends JsonTestVector<Measurement, AggregationResult>,
  Prio3Instantiation extends Prio3<Measurement, AggregationResult>,
>(
  expectedTestVector: TestVectorJson,
  instantiation: Prio3Instantiation,
  additional: { [key: string]: unknown } = {},
) {
  const nonces = expectedTestVector.prep.map((prep) =>
    Buffer.from(prep.nonce, "hex"),
  );
  const verifyKey = Buffer.from(expectedTestVector.verify_key, "hex");
  const measurements = expectedTestVector.prep.map((prep) => prep.measurement);
  const rands = measurements.map((_) =>
    Buffer.from(deterministicRandom(instantiation.randSize)),
  );

  const actualTestVector = await runPrio3(
    instantiation,
    measurements,
    nonces,
    verifyKey,
    rands,
  );

  assert.deepEqual({ ...actualTestVector, ...additional }, expectedTestVector);
}
