import assert from "assert";
import {
  integerToOctetString,
  octetStringToInteger,
  nextPowerOf2,
  nextPowerOf2Big,
} from "common";
import { Field128 } from "field";

describe("common", () => {
  describe("integerToOctetString", () => {
    it("does not like when the number would require more than the second argument", () => {
      assert.throws(() => integerToOctetString(256n ** 10n, 10));
      assert.throws(() => integerToOctetString(256n ** 10n + 1n, 10));
      assert.doesNotThrow(() => integerToOctetString(256n ** 10n - 1n, 10));
    });

    it("has some expected values", () => {
      assert.deepEqual(
        [...integerToOctetString(BigInt(256), 5)],
        [0, 0, 0, 1, 0]
      );

      assert.deepEqual(
        [...integerToOctetString(BigInt(255), 5)],
        [0, 0, 0, 0, 255]
      );

      assert.deepEqual(
        [
          ...integerToOctetString(
            BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
            10
          ),
        ],
        [0, 0, 0, 32, 0, 0, 0, 0, 0, 0]
      );
    });

    it("round trips some large numbers", () => {
      for (const n of Field128.fillRandom(100).toValues()) {
        assert.equal(
          n,
          octetStringToInteger(integerToOctetString(n, Field128.encodedSize))
        );
      }
    });
  });

  describe("octetStringToInteger", () => {
    it("has some expected values", () => {
      assert.equal(
        BigInt(256),
        octetStringToInteger(new Uint8Array([0, 1, 0]))
      );
      assert.equal(
        BigInt(255),
        octetStringToInteger(new Uint8Array([0, 0, 0, 255]))
      );

      assert.equal(
        BigInt(256) ** BigInt(3),
        octetStringToInteger(new Uint8Array([0, 1, 0, 0, 0]))
      );

      assert.equal(
        BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
        octetStringToInteger(new Uint8Array([0, 0, 0, 32, 0, 0, 0, 0, 0, 0]))
      );
    });
  });

  describe("nextPowerOf2", () => {
    it("has expected mappings", () => {
      assert.equal(nextPowerOf2(1), 1);
      assert.equal(nextPowerOf2(2), 2);
      assert.equal(nextPowerOf2(3), 4);
      assert.equal(nextPowerOf2(4), 4);
      assert.equal(nextPowerOf2(5), 8);
    });

    it("does not have an answer for negative numbers", () => {
      assert.throws(() => nextPowerOf2(-100));
    });
  });

  describe("nextPowerOf2Big", () => {
    it("has expected mappings", () => {
      assert.equal(nextPowerOf2Big(1n), 1n);
      assert.equal(nextPowerOf2Big(2n), 2n);
      assert.equal(nextPowerOf2Big(3n), 4n);
      assert.equal(nextPowerOf2Big(4n), 4n);
      assert.equal(nextPowerOf2Big(5n), 8n);
    });

    it("does not have an answer for negative numbers", () => {
      assert.throws(() => nextPowerOf2Big(-100n));
    });
  });
});
