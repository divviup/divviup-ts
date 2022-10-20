import { ReportId } from "./reportId";
import assert from "assert";

describe("DAP ReportID", () => {
  describe("random", () => {
    it("generates a random ReportID", () => {
      const reportId = ReportId.random();
      assert.equal(reportId.buffer.length, 16);
    });
  });

  describe("construction", () => {
    it("throws an error if rand is not exactly 16 bytes", () => {
      assert.throws(() => new ReportId(Buffer.alloc(15)));
      assert.doesNotThrow(() => new ReportId(Buffer.alloc(16)));
      assert.throws(() => new ReportId(Buffer.alloc(17)));
    });
  });

  describe("encode", () => {
    it("writes 16 bytes of rand", () => {
      const rand = Buffer.alloc(16, 255);
      const reportId = new ReportId(rand);

      assert.deepEqual(
        reportId.encode(),
        Buffer.from([
          255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
          255, 255,
        ])
      );
    });
  });
});
