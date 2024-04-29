import { Prio3 } from "./index.js";
import assert from "assert";
import {
  Prio3Count,
  Prio3Histogram,
  Prio3Sum,
  Prio3SumVec,
} from "./instantiations.js";
import { TestFlp128 } from "./flp.spec.js";
import { XofTurboShake128 } from "@divviup/xof";
import type { TestVector } from "@divviup/vdaf";
import countTestVector0 from "./testVectors/Prio3Count_0.json" assert { type: "json" };
import countTestVector1 from "./testVectors/Prio3Count_1.json" assert { type: "json" };
import histogramTestVector0 from "./testVectors/Prio3Histogram_0.json" assert { type: "json" };
import histogramTestVector1 from "./testVectors/Prio3Histogram_1.json" assert { type: "json" };
import sumTestVector0 from "./testVectors/Prio3Sum_0.json" assert { type: "json" };
import sumTestVector1 from "./testVectors/Prio3Sum_1.json" assert { type: "json" };
import sumVecTestVector0 from "./testVectors/Prio3SumVec_0.json" assert { type: "json" };
import sumVecTestVector1 from "./testVectors/Prio3SumVec_1.json" assert { type: "json" };

async function assertCountTestVector(
  testVector: TestVector<null, number | boolean, number>,
) {
  const instantiation = new Prio3Count({ shares: testVector.shares });
  for (const prep of testVector.prep) {
    prep.measurement = prep.measurement !== 0;
  }
  await assertPrio3TestVector(testVector, instantiation);
}

async function assertSumTestVector(
  testVector: TestVector<null, number, number> & { bits: number },
) {
  const { shares, bits } = testVector;
  const instantiation = new Prio3Sum({ shares: shares, bits: bits });
  await assertPrio3TestVector(testVector, instantiation, { bits });
}

async function assertSumVecTestVector(
  testVector: TestVector<null, number[], number[]> & {
    bits: number;
    length: number;
    chunk_length: number;
  },
) {
  const { shares, length, bits, chunk_length } = testVector;
  const instantiation = new Prio3SumVec({
    shares,
    chunkLength: chunk_length,
    bits,
    length,
  });
  await assertPrio3TestVector(testVector, instantiation, {
    length,
    chunk_length,
    bits,
  });
}

async function assertHistogramTestVector(
  testVector: TestVector<null, number, number[]> & {
    length: number;
    chunk_length: number;
  },
) {
  const { shares, length, chunk_length } = testVector;
  const instantiation = new Prio3Histogram({
    shares,
    chunkLength: chunk_length,
    length,
  });
  await assertPrio3TestVector(testVector, instantiation, {
    length,
    chunk_length,
  });
}

describe("prio3 vdaf", () => {
  it("test flp", async () => {
    const testFlp = new Prio3(XofTurboShake128, new TestFlp128(), 2, 255);
    assert.equal(await testFlp.test(null, [1, 2, 3, 4, 4]), 14);
  });

  describe("count", () => {
    it("passes tests", async () => {
      const count = new Prio3Count({ shares: 2 });
      assert.equal(await count.test(null, [false, true, true, false, true]), 3);
      assert.equal(await count.test(null, [true]), 1);
    });

    it("conforms to test vector 0", async () => {
      await assertCountTestVector(countTestVector0);
    });

    it("conforms to test vector 1", async () => {
      await assertCountTestVector(countTestVector1);
    });
  });

  describe("sum", () => {
    it("passes tests", async () => {
      const sum = new Prio3Sum({ shares: 2, bits: 8 });
      assert.equal(await sum.test(null, [0n, 147n, 1n, 0n, 11n, 0n]), 159);
      assert.equal(await sum.test(null, [100n]), 100);
    });

    it("conforms to test vector 0", async () => {
      await assertSumTestVector(sumTestVector0);
    });

    it("conforms to test vector 1", async () => {
      await assertSumTestVector(sumTestVector1);
    });
  });

  describe("histogram", () => {
    it("passes tests", async () => {
      const histogram = new Prio3Histogram({
        shares: 2,
        length: 4,
        chunkLength: 2,
      });
      assert.deepEqual(await histogram.test(null, [0]), [1, 0, 0, 0]);
      assert.deepEqual(await histogram.test(null, [1]), [0, 1, 0, 0]);
      assert.deepEqual(await histogram.test(null, [2]), [0, 0, 1, 0]);
      assert.deepEqual(await histogram.test(null, [3]), [0, 0, 0, 1]);
      assert.deepEqual(
        await histogram.test(null, [0, 0, 1, 1, 2, 2, 3, 3]),
        [2, 2, 2, 2],
      );
    });
    it("conforms to test vector 0", async () => {
      await assertHistogramTestVector(histogramTestVector0);
    });

    it("conforms to test vector 1", async () => {
      await assertHistogramTestVector(histogramTestVector1);
    });
  });

  describe("SumVec", () => {
    it("passes tests", async () => {
      const sumVec = new Prio3SumVec({
        length: 10,
        bits: 8,
        chunkLength: 9,
        shares: 2,
      });
      assert.equal(sumVec.id, 2);
      assert.deepEqual(
        await sumVec.test(null, [[1, 61, 86, 61, 23, 0, 255, 3, 2, 1]]),
        [1, 61, 86, 61, 23, 0, 255, 3, 2, 1],
      );
    });

    it("conforms to test vector 0", async () => {
      await assertSumVecTestVector(sumVecTestVector0);
    });

    it("conforms to test vector 1", async () => {
      await assertSumVecTestVector(sumVecTestVector1);
    });
  });
});

function runPrio3<M, AR>(
  instantiation: Prio3<M, AR>,
  measurements: M[],
  nonces: Buffer[],
  verifyKey: Buffer,
  rands: Buffer[],
): Promise<TestVector<null, M, AR>> {
  const aggregationParameter = null;
  return instantiation.run({
    aggregationParameter,
    nonces,
    measurements,
    verifyKey,
    rands,
  });
}

async function assertPrio3TestVector<
  Measurement,
  AggregationResult,
  TestVectorJson extends TestVector<null, Measurement, AggregationResult>,
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
  const rands = expectedTestVector.prep.map((prep) =>
    Buffer.from(prep.rand, "hex"),
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
