import { Prio3 } from ".";
import {
  Prio3Aes128Count,
  Prio3Aes128Histogram,
  Prio3Aes128Sum,
} from "./instantiations";
import { TestFlp128 } from "./flp.spec";
import { PrgAes128 } from "@divviup/prg";
import { testVdaf } from "@divviup/vdaf";

describe("prio3 vdaf", () => {
  it("test flp", async () => {
    const testFlp = new Prio3(PrgAes128, new TestFlp128(), 2);
    await testVdaf(testFlp, null, [1, 2, 3, 4, 4], [14], true);
  });

  it("count", async () => {
    const count = new Prio3Aes128Count({ shares: 2 });
    await testVdaf(count, null, [false, true, true, false, true], [3]);
    await testVdaf(count, null, [true], [1], true);
  });

  it("sum", async () => {
    const sum = new Prio3Aes128Sum({ shares: 2, bits: 8 });
    await testVdaf(sum, null, [0n, 147n, 1n, 0n, 11n, 0n], [159]);
    await testVdaf(sum, null, [100n], [100n], true);
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
    await testVdaf(histogram, null, [50], [0, 0, 1, 0], true);
  });
});
