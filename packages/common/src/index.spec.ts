import assert from "assert";
import {
  integerToOctetString,
  octetStringToInteger,
  nextPowerOf2,
  nextPowerOf2Big,
  zip,
  concat,
  arr,
  fill,
  split,
} from ".";

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
      const bytes = 15;
      const numbers = 10;

      for (const octetString of arr(
        numbers,
        () => new Uint8Array(arr(bytes, () => Math.floor(Math.random() * 255)))
      )) {
        assert.deepEqual(
          octetString,
          integerToOctetString(octetStringToInteger(octetString), bytes)
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

  describe("zip", () => {
    it("returns the pairwise elements when the lengths are the same", () => {
      assert.deepEqual(zip([0, 1, 2], ["a", "b", "c"]), [
        [0, "a"],
        [1, "b"],
        [2, "c"],
      ]);
    });

    it("throws when the lengths are not the same", () => {
      assert.throws(() => zip([0, 1], ["a", "b", "c"]));
    });
  });

  describe("concat", () => {
    it("can combine multiple uint8Arrays", () => {
      const actual = concat([
        Uint8Array.of(1, 2, 3),
        Uint8Array.of(4, 5, 6),
        Uint8Array.of(7, 8, 9),
      ]);
      const expected = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9);
      assert.deepEqual(actual, expected);
    });
  });

  describe("fill", () => {
    it("fills an array of |length| with a constant |value|", () => {
      assert.deepEqual(fill(5, 10n), [10n, 10n, 10n, 10n, 10n]);
      assert.deepEqual(fill(2, true), [true, true]);
    });
  });

  describe("split", () => {
    it("slices an array into two parts", () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const [left, right] = split(arr, 5);
      assert.deepEqual([1, 2, 3, 4, 5], left);
      assert.deepEqual([6, 7, 8, 9, 10], right);
    });

    it("also works with other sliceables", () => {
      const arr = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const [left, right] = split(arr, 5);
      assert.deepEqual(new Uint8Array([1, 2, 3, 4, 5]), left);
      assert.deepEqual(new Uint8Array([6, 7, 8, 9, 10]), right);
    });
  });
});
