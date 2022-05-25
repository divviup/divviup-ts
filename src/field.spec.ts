import assert from "assert";
import { Field, Field64, Field96, Field128 } from "field";
import { arr } from "common";

function testField(field: Field, name: string) {
  describe(name, () => {
    describe("modulus arithmetic within the field", () => {
      const x = field.randomElement();
      const y = field.randomElement();

      it("can do addition", () => {
        assert.equal(field.add(x, y), (x + y) % field.modulus);
      });

      it("can do multiplication", () => {
        assert.equal(field.mul(x, y), (x * y) % field.modulus);
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
    });

    it("does not decode when the field is not a multiple of encodedSize", () => {
      const oneByteTooLong = Buffer.alloc(field.encodedSize + 1, 10);
      assert.throws(() => field.decode(oneByteTooLong));

      const oneByteTooShort = Buffer.alloc(field.encodedSize - 1, 10);
      assert.throws(() => field.decode(oneByteTooShort));
    });

    it("encodes and decodes a round trip correctly", () => {
      const randVec = field.fillRandom(10);
      assert.deepEqual(randVec, field.decode(field.encode(randVec)));
    });

    it("has a generator that wraps around the field", () => {
      assert.equal(field.exp(field.generator, field.genOrder), 1n);
    });

    it("correctly interpolates polynomials", () => {
      const p = field.fillRandom(10);
      const xs = arr(10, BigInt);
      const ys = xs.map((x) => field.evalPoly(p, x));
      const q = field.interpolate(xs, ys);
      for (const x of xs) {
        const a = field.evalPoly(p, x);
        const b = field.evalPoly(q, x);
        assert.equal(a, b);
      }
    });
  });
}

describe("Fields", () => {
  testField(Field64, "Field64");
  testField(Field96, "Field96");
  testField(Field128, "Field128");
});
