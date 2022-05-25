import { FiniteField, createPrimeField } from "@guildofweavers/galois";
export { Vector } from "@guildofweavers/galois";
import { integerToOctetString, octetStringToInteger, arr } from "common";

export class Field {
  readonly #finiteField: FiniteField;
  readonly modulus: bigint;
  readonly genOrder: bigint;
  readonly encodedSize: number;
  readonly generator: bigint;

  constructor({
    modulus,
    genOrder,
    encodedSize,
    generator: generatorParts,
  }: FieldConstructorArgs) {
    this.#finiteField = createPrimeField(modulus);
    this.modulus = modulus;
    this.genOrder = genOrder;
    this.encodedSize = encodedSize;
    this.generator = this.#finiteField.exp(
      generatorParts.base,
      generatorParts.exponent
    );
  }

  mod(i: bigint): bigint {
    return i % this.modulus;
  }

  sub(x: bigint, y: bigint): bigint {
    return this.#finiteField.sub(x, y);
  }

  exp(b: bigint, exp: bigint): bigint {
    return this.#finiteField.exp(b, exp);
  }

  evalPoly(p: bigint[], x: bigint): bigint {
    const pVec = this.#finiteField.newVectorFrom(p);
    return this.#finiteField.evalPolyAt(pVec, x);
  }

  vec(data: number | bigint[]): bigint[] {
    if (typeof data === "number") {
      return arr(data, () => 0n);
    } else {
      return data.map((d) => this.mod(d));
    }
  }

  interpolate(xs: bigint[], ys: bigint[]): bigint[] {
    const xsVec = this.#finiteField.newVectorFrom(xs);
    const ysVec = this.#finiteField.newVectorFrom(ys);

    return this.#finiteField.interpolate(xsVec, ysVec).toValues();
  }

  add(a: bigint, b: bigint): bigint {
    return this.#finiteField.add(a, b);
  }

  mul(a: bigint, b: bigint): bigint {
    return this.#finiteField.mul(a, b);
  }

  mulPolys(a: bigint[], b: bigint[]): bigint[] {
    const aVec = this.#finiteField.newVectorFrom(a);
    const bVec = this.#finiteField.newVectorFrom(b);

    return this.#finiteField.mulPolys(aVec, bVec).toValues();
  }

  randomElement(): bigint {
    return this.#finiteField.rand();
  }

  encode(data: bigint[]): Buffer {
    return Buffer.concat(
      data.map((x) => integerToOctetString(x, this.encodedSize))
    );
  }

  vecSub(a: bigint[], b: bigint[]): bigint[] {
    const aVec = this.#finiteField.newVectorFrom(a);
    const bVec = this.#finiteField.newVectorFrom(b);

    return this.#finiteField.subVectorElements(aVec, bVec).toValues();
  }

  vecAdd(a: bigint[], b: bigint[]): bigint[] {
    const aVec = this.#finiteField.newVectorFrom(a);
    const bVec = this.#finiteField.newVectorFrom(b);
    return this.#finiteField.addVectorElements(aVec, bVec).toValues();
  }

  decode(encoded: Buffer): bigint[] {
    const encodedSize = this.encodedSize;
    if (encoded.length % encodedSize !== 0) {
      throw new Error(
        `could not decode, expected ${encoded.length} to be a multiple of ${encodedSize}`
      );
    }

    return this.vec(
      arr(encoded.length / encodedSize, (index) =>
        octetStringToInteger(
          encoded.slice(index * encodedSize, (index + 1) * encodedSize)
        )
      )
    );
  }

  fillRandom(length: number): bigint[] {
    return this.vec(arr(length, () => this.#finiteField.rand()));
  }

  sum<T>(arr: T[], mapper: (value: T, index: number) => bigint): bigint {
    return arr.reduce(
      (sum, value, index) => this.add(sum, mapper(value, index)),
      0n
    );
  }
}

interface FieldConstructorArgs {
  modulus: bigint;
  genOrder: bigint;
  encodedSize: number;
  generator: { base: bigint; exponent: bigint };
}

export const Field64 = new Field({
  modulus: 2n ** 32n * 4294967295n + 1n,
  genOrder: 2n ** 32n,
  encodedSize: 8,
  generator: { base: 7n, exponent: 4294967295n },
});

export const Field96 = new Field({
  modulus: 2n ** 64n * 4294966555n + 1n,
  genOrder: 2n ** 64n,
  encodedSize: 12,
  generator: { base: 3n, exponent: 4294966555n },
});

export const Field128: Field = new Field({
  modulus: 2n ** 66n * 4611686018427387897n + 1n,
  genOrder: 2n ** 66n,
  encodedSize: 16,
  generator: { base: 7n, exponent: 4611686018427387897n },
});
