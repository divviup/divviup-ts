import { PrimeField } from "./PrimeField.js";
export { Vector } from "./Vector.js";
import {
  integerToOctetStringLE,
  octetStringToIntegerLE,
  arr,
  concat,
} from "@divviup/common";

export class Field {
  readonly #primeField: PrimeField;
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
    this.#primeField = new PrimeField(modulus);
    this.modulus = modulus;
    this.genOrder = genOrder;
    this.encodedSize = encodedSize;
    this.generator = this.#primeField.exp(
      generatorParts.base,
      generatorParts.exponent,
    );
  }

  sub(x: bigint, y: bigint): bigint {
    return this.#primeField.sub(x, y);
  }

  exp(b: bigint, exp: bigint): bigint {
    return this.#primeField.exp(b, exp);
  }

  evalPoly(p: bigint[], x: bigint): bigint {
    const pVec = this.#primeField.newVectorFrom(p);
    return this.#primeField.evalPolyAt(pVec, x);
  }

  interpolate(rootsOfUnity: bigint[], ys: bigint[]): bigint[] {
    const rootsOfUnityVec = this.#primeField.newVectorFrom(rootsOfUnity);
    const ysVec = this.#primeField.newVectorFrom(ys);
    return this.#primeField.interpolateRoots(rootsOfUnityVec, ysVec).toValues();
  }

  add(a: bigint, b: bigint): bigint {
    return this.#primeField.add(a, b);
  }

  mul(a: bigint, b: bigint): bigint {
    return this.#primeField.mul(a, b);
  }

  mulPolys(a: bigint[], b: bigint[]): bigint[] {
    const aVec = this.#primeField.newVectorFrom(a);
    const bVec = this.#primeField.newVectorFrom(b);

    return this.#primeField.mulPolys(aVec, bVec).toValues();
  }

  randomElement(): bigint {
    return this.#primeField.rand();
  }

  encode(data: bigint[]): Uint8Array {
    return concat(data.map((x) => integerToOctetStringLE(x, this.encodedSize)));
  }

  vecSub(a: bigint[], b: bigint[]): bigint[] {
    const aVec = this.#primeField.newVectorFrom(a);
    const bVec = this.#primeField.newVectorFrom(b);

    return this.#primeField.subVectorElements(aVec, bVec).toValues();
  }

  vecAdd(a: bigint[], b: bigint[]): bigint[] {
    const aVec = this.#primeField.newVectorFrom(a);
    const bVec = this.#primeField.newVectorFrom(b);
    return this.#primeField.addVectorElements(aVec, bVec).toValues();
  }

  decode(encoded: Uint8Array): bigint[] {
    const encodedSize = this.encodedSize;
    if (encoded.length % encodedSize !== 0) {
      throw new Error(
        `could not decode, expected ${encoded.length} to be a multiple of ${encodedSize}`,
      );
    }

    return arr(encoded.length / encodedSize, (index) => {
      const n = octetStringToIntegerLE(
        encoded.slice(index * encodedSize, (index + 1) * encodedSize),
      );
      if (n >= this.modulus) {
        throw new Error("decoded an element that is not in the field");
      }
      return n;
    });
  }

  fillRandom(length: number): bigint[] {
    return arr(length, () => this.#primeField.rand());
  }

  sum<T>(arr: T[], mapper: (value: T, index: number) => bigint): bigint {
    return arr.reduce(
      (sum, value, index) => this.add(sum, mapper(value, index)),
      0n,
    );
  }

  additiveSecretShare(input: bigint[], numShares: number): bigint[][] {
    const shares = arr(numShares - 1, () => this.fillRandom(input.length));
    return [
      ...shares,
      shares.reduce((last, share) => this.vecSub(last, share), input),
    ];
  }
}

interface FieldConstructorArgs {
  modulus: bigint;
  genOrder: bigint;
  encodedSize: number;
  generator: { base: bigint; exponent: bigint };
}

export class Field64 extends Field {
  constructor() {
    super({
      modulus: 2n ** 32n * 4294967295n + 1n,
      genOrder: 2n ** 32n,
      encodedSize: 8,
      generator: { base: 7n, exponent: 4294967295n },
    });
  }
}

export class Field96 extends Field {
  constructor() {
    super({
      modulus: 2n ** 64n * 4294966555n + 1n,
      genOrder: 2n ** 64n,
      encodedSize: 12,
      generator: { base: 3n, exponent: 4294966555n },
    });
  }
}

export class Field128 extends Field {
  constructor() {
    super({
      modulus: 2n ** 66n * 4611686018427387897n + 1n,
      genOrder: 2n ** 66n,
      encodedSize: 16,
      generator: { base: 7n, exponent: 4611686018427387897n },
    });
  }
}
