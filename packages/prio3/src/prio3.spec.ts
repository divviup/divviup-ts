import { Prio3 } from ".";
import assert from "assert";
import {
  Prio3Aes128Count,
  Prio3Aes128Histogram,
  Prio3Aes128Sum,
} from "./instantiations";
import { TestFlp128 } from "./flp.spec";
import { PrgAes128 } from "@divviup/prg";
import { runVdaf, testVdaf, TestVector } from "@divviup/vdaf";
import { randomBytes } from "@divviup/common";

import countTestVector0 from "./testVectors/Prio3Aes128Count_0.json";
import histogramTestVector0 from "./testVectors/Prio3Aes128Histogram_0.json";
import sumTestVector0 from "./testVectors/Prio3Aes128Sum_0.json";

describe("prio3 vdaf", () => {
  it("test flp", async () => {
    const testFlp = new Prio3(PrgAes128, new TestFlp128(), 2, 255);
    await testVdaf(testFlp, null, [1, 2, 3, 4, 4], [14]);
  });

  it("count", async () => {
    const count = new Prio3Aes128Count({ shares: 2 });
    await testVdaf(count, null, [false, true, true, false, true], [3]);
    await testVdaf(count, null, [true], [1]);

    await assertPrio3TestVector(
      {
        ...countTestVector0,
        prep: countTestVector0.prep.map((prep) => ({
          ...prep,
          measurement: prep.measurement !== 0,
        })),
      },
      count
    );
  });

  it("sum", async () => {
    const sum = new Prio3Aes128Sum({ shares: 2, bits: 8 });
    await testVdaf(sum, null, [0n, 147n, 1n, 0n, 11n, 0n], [159]);
    await testVdaf(sum, null, [100n], [100]);

    await assertPrio3TestVector(sumTestVector0, sum);
  });

  it("histogram", async () => {
    const histogram = new Prio3Aes128Histogram({
      shares: 2,
      buckets: [1, 10, 100],
    });
    await testVdaf(histogram, null, [0], [1, 0, 0, 0]);
    await testVdaf(histogram, null, [5], [0, 1, 0, 0]);
    await testVdaf(histogram, null, [10], [0, 1, 0, 0]);
    await testVdaf(histogram, null, [15], [0, 0, 1, 0]);
    await testVdaf(histogram, null, [100], [0, 0, 1, 0]);
    await testVdaf(histogram, null, [101], [0, 0, 0, 1]);
    await testVdaf(
      histogram,
      null,
      [0, 1, 5, 10, 15, 100, 101, 101],
      [2, 2, 2, 2]
    );
    await testVdaf(histogram, null, [50], [0, 0, 1, 0]);

    await assertPrio3TestVector(histogramTestVector0, histogram);
  });
});

type JsonTestVector<Measurement> = TestVector<
  null,
  Measurement,
  string[],
  string,
  number[] | number
>;

async function runPrio3<M>(
  instantiation: Prio3<M>,
  measurements: M[],
  nonces: Buffer[]
): Promise<JsonTestVector<M>> {
  const aggregationParameter = null;
  const testVector = await runVdaf(
    instantiation,
    aggregationParameter,
    nonces,
    measurements
  );

  return {
    ...testVector,

    agg_result:
      testVector.agg_result?.length === 1
        ? testVector.agg_result[0]
        : testVector.agg_result,

    agg_shares: testVector.agg_shares.map((x) =>
      Buffer.from(instantiation.flp.field.encode(x)).toString("hex")
    ),

    prep: testVector.prep.map((prep) => ({
      ...prep,
      out_shares: prep.out_shares.map((outShare) =>
        outShare.map((bigNumber) => bigNumber.toString(16))
      ),
    })),
  };
}

async function assertPrio3TestVector<
  Measurement,
  TestVectorJson extends JsonTestVector<Measurement>,
  Prio3Instantiation extends Prio3<Measurement>
>(expectedTestVector: TestVectorJson, instantiation: Prio3Instantiation) {
  const nonces = expectedTestVector.prep.map((prep) =>
    Buffer.from(prep.nonce, "hex")
  );
  const measurements = expectedTestVector.prep.map((prep) => prep.measurement);

  randomBytes.deterministicMode = true;
  const actualTestVector = await runPrio3(instantiation, measurements, nonces);
  randomBytes.deterministicMode = false;

  assert.deepEqual(expectedTestVector.verify_key, actualTestVector.verify_key);
  assert.deepEqual(expectedTestVector.agg_result, actualTestVector.agg_result);
  assert.deepEqual(expectedTestVector.agg_shares, actualTestVector.agg_shares);
  assert.deepEqual(expectedTestVector.prep, actualTestVector.prep);
}
