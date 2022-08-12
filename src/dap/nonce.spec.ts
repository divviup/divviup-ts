import { Nonce } from "dap/nonce";
import assert from "assert";

describe("DAP Nonce", () => {
  describe("generate", () => {
    it("uses the current time in seconds as the first component", () => {
      const nonce = Nonce.generate();
      assert(Date.now() / 1000 - Number(nonce.time) < 500); // 500ms of delta
    });
  });

  describe("construction", () => {
    it("throws an error if rand is not exactly 16 bytes", () => {
      assert.throws(() => new Nonce(BigInt(0), Buffer.alloc(15)));
      assert.doesNotThrow(() => new Nonce(BigInt(0), Buffer.alloc(16)));
      assert.throws(() => new Nonce(BigInt(0), Buffer.alloc(17)));
    });
  });

  describe("encode", () => {
    it("writes 8 bytes of time and 16 bytes of rand", () => {
      const date = BigInt(1000);
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
