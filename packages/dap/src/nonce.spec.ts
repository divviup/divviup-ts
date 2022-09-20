import { Nonce } from "./nonce";
import assert from "assert";

describe("DAP Nonce", () => {
  describe("generate", () => {
    it("uses the current batch start time in seconds as the first component", () => {
      for (const minBatchDurationSeconds of [1, 3600, 3600 * 24]) {
        const nonce = Nonce.generate(minBatchDurationSeconds);
        // Check that the nonce time is a multiple of the minimum batch
        // duration.
        assert(Number(nonce.time % minBatchDurationSeconds) == 0);
        // Check that the nonce time is no older than one batch interval plus
        // 500ms of slop.
        assert(
          Date.now() / 1000 - Number(nonce.time) < minBatchDurationSeconds + 0.5
        );
      }
    });
  });

  describe("construction", () => {
    it("throws an error if rand is not exactly 16 bytes", () => {
      assert.throws(() => new Nonce(0, Buffer.alloc(15)));
      assert.doesNotThrow(() => new Nonce(0, Buffer.alloc(16)));
      assert.throws(() => new Nonce(0, Buffer.alloc(17)));
    });
  });

  describe("encode", () => {
    it("writes 8 bytes of time and 16 bytes of rand", () => {
      const date = 1000;
      const rand = Buffer.alloc(16, 255);
      const nonce = new Nonce(date, rand);

      assert.deepEqual(
        nonce.encode(),
        Buffer.from([
          ...[0, 0, 0, 0, 0, 0, 3, 232],
          ...[
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255,
          ],
        ])
      );
    });
  });
});
