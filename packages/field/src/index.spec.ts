import assert from "assert";
import { Field, Field64, Field96, Field128 } from ".";
import { arr } from "@divviup/common";

function testField(field: Field, name: string) {
  describe(name, () => {
    describe("modulus arithmetic within the field", () => {
      const x = field.randomElement();
      const y = field.randomElement();

      it("can do addition", () => {
        assert.equal(field.add(x, y), (x + y) % field.modulus);
      });

      it("can do subtraction", () => {
        assert.equal(field.sub(x, y), (field.modulus + x - y) % field.modulus);
      });

      it("can do multiplication", () => {
        assert.equal(field.mul(x, y), (x * y) % field.modulus);
      });

      it("can multiply polynomials", () => {
        assert.deepEqual(field.mulPolys([100n, 2n], [2n, 100n]), [
          200n,
          10004n,
          200n,
        ]);
      });

      it("can do exponentiation", () => {
        assert.equal(field.exp(x, 100n), x ** 100n % field.modulus);
      });

      it("has a sum reducer", () => {
        assert.equal(
          field.sum([field.modulus, 1n, 2n, 3n], (n) => n),
          6n
        );
      });

      it("can do vector addition", () => {
        assert.deepEqual(field.vecAdd([0n, 2n, 5n, 10n], [10n, 8n, 5n, 0n]), [
          10n,
          10n,
          10n,
          10n,
        ]);
      });

      it("can do vector subtraction", () => {
        assert.deepEqual(
          field.vecSub([10n, 10n, 10n, 10n], [11n, 12n, 5n, 0n]),
          [field.modulus - 1n, field.modulus - 2n, 5n, 10n]
        );
      });
    });

    it("does not decode when the input length is not a multiple of encodedSize", () => {
      const oneByteTooLong = Buffer.alloc(field.encodedSize + 1, 10);
      assert.throws(() => field.decode(oneByteTooLong));

      const oneByteTooShort = Buffer.alloc(field.encodedSize - 1, 10);
      assert.throws(() => field.decode(oneByteTooShort));
    });

    it("throws when decoding an element that is not within the field", () => {
      const value = field.encode([field.modulus + 1n]);
      assert.throws(() => field.decode(value));
    });

    it("encodes and decodes a round trip correctly", () => {
      const randVec = field.fillRandom(10);
      assert.deepEqual(randVec, field.decode(field.encode(randVec)));
    });

    it("has a generator that wraps around the field", () => {
      assert.equal(field.exp(field.generator, field.genOrder), 1n);
    });

    it("correctly interpolates polynomials", () => {
      for (const count of [2, 4, 8, 16, 32, 64, 128]) {
        const roots = arr(count, (n) =>
          field.exp(
            field.exp(field.generator, field.genOrder / BigInt(count)),
            BigInt(n)
          )
        );

        const poly = field.fillRandom(count);
        const points = arr(count, (n) => field.evalPoly(poly, roots[n]));
        const interpolated = field.interpolate(roots, points);

        assert.deepEqual(interpolated, poly);
      }
    });
  });
}

describe("Fields", () => {
  testField(new Field64(), "Field64");
  testField(new Field96(), "Field96");
  testField(new Field128(), "Field128");
});
