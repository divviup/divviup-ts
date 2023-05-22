/// source: https://github.com/GuildOfWeavers/galois
import { webcrypto } from "one-webcrypto";
import { Vector } from "./Vector";
import { octetStringToIntegerBE } from "@divviup/common";

// IMPORTS
// ================================================================================================

// DATA TYPES
// ----------------------------------------------------------------------------------------

// INTERFACES
// ================================================================================================
interface ArithmeticOperation {
  (this: PrimeField, a: bigint, b: bigint): bigint;
}

// CONSTANTS
// ================================================================================================
const MIN_ELEMENT_SIZE = 8; // 64-bits

// CLASS DEFINITION
// ================================================================================================
export class PrimeField {
  readonly modulus: bigint;
  readonly elementSize: number;

  // CONSTRUCTOR
  // --------------------------------------------------------------------------------------------
  constructor(modulus: bigint) {
    this.modulus = modulus;

    let bitWidth = 1;
    while (modulus != 1n) {
      modulus = modulus >> 1n;
      bitWidth++;
    }
    this.elementSize = Math.max(Math.ceil(bitWidth / 8), MIN_ELEMENT_SIZE);
  }

  // BASIC ARITHMETIC
  // --------------------------------------------------------------------------------------------
  mod(value: bigint): bigint {
    return value >= 0n
      ? value % this.modulus
      : ((value % this.modulus) + this.modulus) % this.modulus;
  }

  add(x: bigint, y: bigint): bigint {
    return this.mod(x + y);
  }

  sub(x: bigint, y: bigint): bigint {
    return this.mod(x - y);
  }

  mul(x: bigint, y: bigint): bigint {
    return this.mod(x * y);
  }

  div(x: bigint, y: bigint) {
    return this.mul(x, this.inv(y));
  }

  exp(base: bigint, exponent: bigint): bigint {
    base = this.mod(base);

    if (base === 0n) {
      if (exponent === 0n) {
        throw new TypeError("Base and exponent cannot be both 0");
      }
      return 0n;
    }

    // handle raising to negative power
    if (exponent < 0n) {
      base = this.inv(base);
      exponent = -exponent;
    }

    let result = 1n;
    while (exponent > 0n) {
      if (exponent % 2n) {
        result = this.mul(result, base);
      }
      exponent = exponent / 2n;
      base = this.mul(base, base);
    }

    return result;
  }

  inv(a: bigint): bigint {
    let low = this.mod(a);
    if (low === 0n) return 0n;
    let lm = 1n,
      hm = 0n;
    let high = this.modulus;

    while (low > 1n) {
      const r = high / low;
      const nm = hm - lm * r;
      const nw = high - low * r;

      high = low;
      hm = lm;
      lm = nm;
      low = nw;
    }
    return this.mod(lm);
  }

  // RANDOMNESS
  // --------------------------------------------------------------------------------------------
  rand(): bigint {
    let n = this.modulus;
    const buffer = new Uint8Array(this.elementSize);

    while (n >= this.modulus) {
      //rejection sampling
      webcrypto.getRandomValues(buffer);
      n = octetStringToIntegerBE(buffer);
    }

    return n;
  }

  // VECTOR OPERATIONS
  // --------------------------------------------------------------------------------------------

  newVectorFrom(values: bigint[]): Vector {
    return new Vector(values, this.elementSize);
  }

  addVectorElements(a: Vector, b: bigint | Vector): Vector {
    return typeof b === "bigint"
      ? this.vectorScalarOp(this.add.bind(this), a, b)
      : this.vectorElementsOp(this.add.bind(this), a, b);
  }

  subVectorElements(a: Vector, b: bigint | Vector): Vector {
    return typeof b === "bigint"
      ? this.vectorScalarOp(this.sub.bind(this), a, b)
      : this.vectorElementsOp(this.sub.bind(this), a, b);
  }

  mulVectorElements(a: Vector, b: bigint | Vector): Vector {
    return typeof b === "bigint"
      ? this.vectorScalarOp(this.mul.bind(this), a, b)
      : this.vectorElementsOp(this.mul.bind(this), a, b);
  }

  divVectorElements(a: Vector, b: bigint | Vector): Vector {
    return typeof b === "bigint"
      ? this.vectorScalarOp(this.mul.bind(this), a, this.inv(b))
      : this.vectorElementsOp(
          this.mul.bind(this),
          a,
          this.invVectorElements(b)
        );
  }

  expVectorElements(a: Vector, b: bigint | Vector): Vector {
    return typeof b === "bigint"
      ? this.vectorScalarOp(this.exp.bind(this), a, b)
      : this.vectorElementsOp(this.exp.bind(this), a, b);
  }

  invVectorElements(source: Vector): Vector {
    const rValues = new Array<bigint>(source.length);
    const sValues = source.toValues();

    let last = 1n;
    for (let i = 0; i < source.length; i++) {
      rValues[i] = last;
      last = this.mod(last * (sValues[i] || 1n));
    }

    let inv = this.inv(last);
    for (let i = source.length - 1; i >= 0; i--) {
      rValues[i] = this.mod(sValues[i] ? rValues[i] * inv : 0n);
      inv = this.mul(inv, sValues[i] || 1n);
    }
    return this.newVectorFrom(rValues);
  }

  combineVectors(a: Vector, b: Vector): bigint {
    const aValues = a.toValues(),
      bValues = b.toValues();
    let result = 0n;
    for (let i = 0; i < a.length; i++) {
      result = this.mod(result + aValues[i] * bValues[i]);
    }
    return result;
  }

  private vectorElementsOp(
    op: ArithmeticOperation,
    a: Vector,
    b: Vector
  ): Vector {
    const aValues = a.toValues(),
      bValues = b.toValues();
    const rValues = new Array<bigint>(a.length);
    for (let i = 0; i < rValues.length; i++) {
      rValues[i] = op.call(this, aValues[i], bValues[i]);
    }
    return new Vector(rValues, this.elementSize);
  }

  private vectorScalarOp(
    op: ArithmeticOperation,
    a: Vector,
    b: bigint
  ): Vector {
    const aValues = a.toValues();
    const rValues = new Array<bigint>(a.length);
    for (let i = 0; i < rValues.length; i++) {
      rValues[i] = op.call(this, aValues[i], b);
    }
    return new Vector(rValues, this.elementSize);
  }

  // OTHER OPERATIONS
  // --------------------------------------------------------------------------------------------
  getRootOfUnity(order: number): bigint {
    if (!isPowerOf2(order)) {
      throw new Error("Order of unity must be 2^n");
    }
    // TODO: improve algorithm (for non 2**n roots), add upper bound
    const bigOrder = BigInt(order);
    for (let i = 2n; i < this.modulus; i++) {
      const g = this.exp(i, (this.modulus - 1n) / bigOrder);
      if (this.exp(g, bigOrder) === 1n && this.exp(g, bigOrder / 2n) !== 1n) {
        return g;
      }
    }

    throw new Error(`Root of Unity for order ${order} was not found`);
  }

  getPowerSeries(seed: bigint, length: number): Vector {
    const powers = new Array<bigint>(length);
    powers[0] = 1n;
    for (let i = 1; i < length; i++) {
      powers[i] = this.mul(powers[i - 1], seed);
    }
    return this.newVectorFrom(powers);
  }

  // POLYNOMIALS
  // --------------------------------------------------------------------------------------------
  addPolys(a: Vector, b: Vector): Vector {
    const aValues = a.toValues(),
      bValues = b.toValues();
    const rValues = new Array<bigint>(Math.max(a.length, b.length));
    for (let i = 0; i < rValues.length; i++) {
      const coefficientA = i < a.length ? aValues[i] : 0n;
      const coefficientB = i < b.length ? bValues[i] : 0n;
      rValues[i] = this.mod(coefficientA + coefficientB);
    }
    return this.newVectorFrom(rValues);
  }

  subPolys(a: Vector, b: Vector): Vector {
    const aValues = a.toValues(),
      bValues = b.toValues();
    const rValues = new Array<bigint>(Math.max(a.length, b.length));
    for (let i = 0; i < rValues.length; i++) {
      const coefficientA = i < a.length ? aValues[i] : 0n;
      const coefficientB = i < b.length ? bValues[i] : 0n;
      rValues[i] = this.mod(coefficientA - coefficientB);
    }
    return this.newVectorFrom(rValues);
  }

  mulPolys(a: Vector, b: Vector): Vector {
    const aValues = a.toValues(),
      bValues = b.toValues();
    const rValues = new Array<bigint>(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        const k = i + j;
        rValues[k] = this.mod((rValues[k] || 0n) + aValues[i] * bValues[j]);
      }
    }
    return this.newVectorFrom(rValues);
  }

  divPolys(a: Vector, b: Vector): Vector {
    const aValues = a.toValues().slice(),
      bValues = b.toValues();

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let apos = lastNonZeroIndex(aValues)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const bpos = lastNonZeroIndex(bValues)!;
    if (apos < bpos) {
      throw new Error("Cannot divide by polynomial of higher order");
    }

    let diff = apos - bpos;
    const rValues = new Array<bigint>(diff + 1);

    for (let p = rValues.length - 1; diff >= 0; diff--, apos--, p--) {
      const quot = this.div(aValues[apos], bValues[bpos]);
      rValues[p] = quot;
      for (let i = bpos; i >= 0; i--) {
        aValues[diff + i] = this.mod(aValues[diff + i] - bValues[i] * quot);
      }
    }

    return this.newVectorFrom(rValues);
  }

  // POLYNOMIAL EVALUATION
  // --------------------------------------------------------------------------------------------
  evalPolyAt(p: Vector, x: bigint): bigint {
    const pValues = p.toValues();
    switch (p.length) {
      case 0:
        return 0n;
      case 1:
        return pValues[0];
      case 2:
        return this.mod(pValues[0] + pValues[1] * x);
      case 3:
        return this.mod(pValues[0] + pValues[1] * x + pValues[2] * x * x);
      case 4: {
        const x2 = x * x;
        const x3 = x2 * x;
        return this.mod(
          pValues[0] + pValues[1] * x + pValues[2] * x2 + pValues[3] * x3
        );
      }
      case 5: {
        const x2 = x * x;
        const x3 = x2 * x;
        return this.mod(
          pValues[0] +
            pValues[1] * x +
            pValues[2] * x2 +
            pValues[3] * x3 +
            pValues[4] * x3 * x
        );
      }
      default: {
        let y = 0n;
        let powerOfx = 1n;

        for (let i = 0; i < p.length; i++) {
          y = this.mod(y + pValues[i] * powerOfx);
          powerOfx = this.mul(powerOfx, x);
        }

        return y;
      }
    }
  }

  evalPolyAtRoots(p: Vector, rootsOfUnity: Vector): Vector {
    if (!isPowerOf2(rootsOfUnity.length)) {
      throw new Error("Number of roots of unity must be a power of 2");
    }
    if (p.length > rootsOfUnity.length) {
      throw new Error(
        "Vectorial degree must be smaller than or equal to the number of roots of unity"
      );
    }

    let pValues = p.toValues();

    // make sure values and roots of unity are of the same length
    if (rootsOfUnity.length > p.length) {
      const tValues = new Array<bigint>(rootsOfUnity.length);
      for (let i = 0; i < p.length; i++) {
        tValues[i] = pValues[i];
      }
      tValues.fill(0n, p.length);
      pValues = tValues;
    }

    const rValues = fastFT(pValues, rootsOfUnity.toValues(), 0, 0, this);
    return this.newVectorFrom(rValues);
  }

  // POLYNOMIAL INTERPOLATION
  // --------------------------------------------------------------------------------------------
  interpolate(xs: Vector, ys: Vector): Vector {
    if (xs.length !== ys.length) {
      throw new Error(
        "Number of x coordinates must be the same as number of y coordinates"
      );
    }

    const xsValues = xs.toValues();
    const root = this.newVectorFrom(zpoly(xsValues, this));
    const divisor = this.newVectorFrom([0n, 1n]);
    const numerators = new Array<Vector>(xs.length);
    for (let i = 0; i < xs.length; i++) {
      divisor.values[0] = -xsValues[i];
      numerators[i] = this.divPolys(root, divisor);
    }

    const denominators = new Array<bigint>(xs.length);
    for (let i = 0; i < xs.length; i++) {
      denominators[i] = this.evalPolyAt(numerators[i], xsValues[i]);
    }
    const invDenValues = this.invVectorElements(
      this.newVectorFrom(denominators)
    ).values;

    const yValues = ys.toValues();
    const rValues = new Array<bigint>(xs.length).fill(0n);
    for (let i = 0; i < xs.length; i++) {
      const ySlice = this.mod(yValues[i] * invDenValues[i]);
      for (let j = 0; j < xs.length; j++) {
        if (numerators[i].values[j] && yValues[i]) {
          rValues[j] = this.mod(rValues[j] + numerators[i].values[j] * ySlice);
        }
      }
    }
    return this.newVectorFrom(rValues);
  }

  interpolateRoots(rootsOfUnity: Vector, ys: Vector): Vector {
    if (!isPowerOf2(rootsOfUnity.length)) {
      throw new Error("Number of roots of unity must be 2^n");
    }

    // reverse roots of unity
    const rouValues = rootsOfUnity.toValues();
    const invlen = this.exp(BigInt(rootsOfUnity.length), this.modulus - 2n);
    const reversedRoots = new Array<bigint>(rootsOfUnity.length);
    reversedRoots[0] = 1n;
    for (let i = rootsOfUnity.length - 1, j = 1; i > 0; i--, j++) {
      reversedRoots[j] = rouValues[i];
    }

    // run FFT to compute the interpolation
    if (ys instanceof Vector) {
      if (rootsOfUnity.length !== ys.length) {
        throw new Error(
          "Number of roots of unity must be the same as number of y coordinates"
        );
      }
      const yValues = ys.toValues();
      const rValues = fastFT(yValues, reversedRoots, 0, 0, this);
      for (let i = 0; i < rValues.length; i++) {
        rValues[i] = this.mod(rValues[i] * invlen);
      }
      return this.newVectorFrom(rValues);
    } else {
      throw new Error(`y-coordinates object is invalid`);
    }
  }
}

// HELPER FUNCTIONS
// ================================================================================================
function fastFT(
  values: readonly bigint[],
  roots: readonly bigint[],
  depth: number,
  offset: number,
  F: PrimeField
): bigint[] {
  const step = 1 << depth;
  const resultLength = roots.length / step;

  if (resultLength == 2) {
    const result = new Array<bigint>(2);
    for (let i = 0; i < 2; i++) {
      let last = values[offset] * roots[0];
      last += values[offset + step] * roots[i * step];
      result[i] = F.mod(last);
    }
    return result;
  }

  // if only 4 values left, use simple FT
  if (resultLength == 4) {
    const result = new Array<bigint>(4);
    for (let i = 0; i < 4; i++) {
      let last = values[offset] * roots[0];
      last += values[offset + step] * roots[i * step];
      last += values[offset + 2 * step] * roots[((i * 2) % 4) * step];
      last += values[offset + 3 * step] * roots[((i * 3) % 4) * step];
      result[i] = F.mod(last);
    }
    return result;
  }

  const even = fastFT(values, roots, depth + 1, offset, F);
  const odd = fastFT(values, roots, depth + 1, offset + step, F);

  const halfLength = resultLength / 2;
  const result = new Array<bigint>(resultLength);
  for (let i = 0; i < halfLength; i++) {
    const x = even[i];
    const y = odd[i];
    const yTimesRoot = y * roots[i * step];
    result[i] = F.add(x, yTimesRoot);
    result[i + halfLength] = F.sub(x, yTimesRoot);
  }

  return result;
}

function zpoly(xs: readonly bigint[], field: PrimeField): bigint[] {
  const result = new Array<bigint>(xs.length + 1);
  result[result.length - 1] = 1n;

  let p = result.length - 2;
  for (let i = 0; i < xs.length; i++, p--) {
    result[p] = 0n;
    for (let j = p; j < result.length - 1; j++) {
      result[j] = field.mod(result[j] - result[j + 1] * xs[i]);
    }
  }
  return result;
}

function lastNonZeroIndex(values: readonly bigint[]) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== 0n) return i;
  }
}

function isPowerOf2(value: number): boolean {
  return value !== 0 && (value & (value - 1)) === 0;
}
