import assert from "assert";
import {
  integerToOctetStringBE,
  octetStringToIntegerBE,
  integerToOctetStringLE,
  octetStringToIntegerLE,
  nextPowerOf2,
  nextPowerOf2Big,
  randomBytes,
  zip,
  concat,
  arr,
  fill,
} from "./index";

describe("common", () => {
  describe("integerToOctetStringLE", () => {
    it("does not like when the number would require more than the second argument", () => {
      assert.throws(() => integerToOctetStringLE(256n ** 10n, 10));
      assert.throws(() => integerToOctetStringLE(256n ** 10n + 1n, 10));
      assert.doesNotThrow(() => integerToOctetStringLE(256n ** 10n - 1n, 10));
    });

    it("has some expected values", () => {
      assert.deepEqual(
        [...integerToOctetStringLE(BigInt(256), 5)],
        [0, 1, 0, 0, 0],
      );

      assert.deepEqual(
        [...integerToOctetStringLE(BigInt(255), 5)],
        [255, 0, 0, 0, 0],
      );

      assert.deepEqual(
        [
          ...integerToOctetStringLE(
            BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
            10,
          ),
        ],
        [0, 0, 0, 0, 0, 0, 32, 0, 0, 0],
      );
    });

    it("round trips some large numbers", () => {
      const bytes = 15;
      const numbers = 10;

      for (const octetString of arr(
        numbers,
        () => new Uint8Array(arr(bytes, () => Math.floor(Math.random() * 255))),
      )) {
        assert.deepEqual(
          octetString,
          integerToOctetStringLE(octetStringToIntegerLE(octetString), bytes),
        );
      }
    });
  });

  describe("octetStringToIntegerLE", () => {
    it("has some expected values", () => {
      assert.equal(
        BigInt(256),
        octetStringToIntegerLE(new Uint8Array([0, 1, 0])),
      );
      assert.equal(
        BigInt(255),
        octetStringToIntegerLE(new Uint8Array([255, 0, 0, 0])),
      );

      assert.equal(
        BigInt(256) ** BigInt(3),
        octetStringToIntegerLE(new Uint8Array([0, 0, 0, 1, 0])),
      );

      assert.equal(
        BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
        octetStringToIntegerLE(new Uint8Array([0, 0, 0, 0, 0, 0, 32, 0, 0, 0])),
      );
    });
  });

  describe("integerToOctetStringBE", () => {
    it("does not like when the number would require more than the second argument", () => {
      assert.throws(() => integerToOctetStringBE(256n ** 10n, 10));
      assert.throws(() => integerToOctetStringBE(256n ** 10n + 1n, 10));
      assert.doesNotThrow(() => integerToOctetStringBE(256n ** 10n - 1n, 10));
    });

    it("has some expected values", () => {
      assert.deepEqual(
        [...integerToOctetStringBE(BigInt(256), 5)],
        [0, 0, 0, 1, 0],
      );

      assert.deepEqual(
        [...integerToOctetStringBE(BigInt(255), 5)],
        [0, 0, 0, 0, 255],
      );

      assert.deepEqual(
        [
          ...integerToOctetStringBE(
            BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
            10,
          ),
        ],
        [0, 0, 0, 32, 0, 0, 0, 0, 0, 0],
      );
    });

    it("round trips some large numbers", () => {
      const bytes = 15;
      const numbers = 10;

      for (const octetString of arr(
        numbers,
        () => new Uint8Array(arr(bytes, () => Math.floor(Math.random() * 255))),
      )) {
        assert.deepEqual(
          octetString,
          integerToOctetStringBE(octetStringToIntegerBE(octetString), bytes),
        );
      }
    });
  });

  describe("octetStringToIntegerBE", () => {
    it("has some expected values", () => {
      assert.equal(
        BigInt(256),
        octetStringToIntegerBE(new Uint8Array([0, 1, 0])),
      );
      assert.equal(
        BigInt(255),
        octetStringToIntegerBE(new Uint8Array([0, 0, 0, 255])),
      );

      assert.equal(
        BigInt(256) ** BigInt(3),
        octetStringToIntegerBE(new Uint8Array([0, 1, 0, 0, 0])),
      );

      assert.equal(
        BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
        octetStringToIntegerBE(new Uint8Array([0, 0, 0, 32, 0, 0, 0, 0, 0, 0])),
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

  describe("randomBytes", () => {
    it("generates different data", () => {
      // this is a weak test but it's probably fine because the code is simple
      const first = randomBytes(300);
      const second = randomBytes(300);
      assert(!Buffer.from(first).equals(Buffer.from(second)));
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
});
