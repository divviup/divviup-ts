import { Circuit } from "../circuit.js";
import { Field } from "@divviup/field";
import { Mul } from "../gadgets/mul.js";
import { arr } from "@divviup/common";
import { ParallelSum } from "../gadgets/parallelSum.js";
import type { Gadget } from "../gadget.js";

export class SumVec extends Circuit<number[], number[]> {
  gadgets: Gadget[];
  jointRandLen = 1;

  gadgetCalls: number[];
  measurementLen: number;
  outputLen: number;

  max: number;
  bits: number;
  length: number;
  chunkLength: number;

  constructor(
    public readonly field: Field,
    length: number,
    bits: number,
    chunkLength: number,
  ) {
    super();

    if (typeof bits !== "number" || Math.trunc(bits) !== bits || bits <= 0) {
      throw new Error("invalid bits");
    }

    const max = Math.pow(2, bits);
    if (max >= this.field.modulus) {
      throw new Error("bit size exceeds field modulus");
    }

    if (
      typeof length !== "number" ||
      Math.trunc(length) !== length ||
      length <= 0
    ) {
      throw new Error("invalid length");
    }
    if (
      typeof chunkLength !== "number" ||
      Math.trunc(chunkLength) !== chunkLength ||
      chunkLength <= 0
    ) {
      throw new Error("invalid chunk length");
    }
    this.gadgets = [new ParallelSum(new Mul(), chunkLength)];
    this.length = length;
    this.chunkLength = chunkLength;
    this.gadgetCalls = [
      Math.floor((length * bits + chunkLength - 1) / chunkLength),
    ];
    this.measurementLen = length * bits;
    this.outputLen = length;
    this.max = max;
    this.bits = bits;
  }

  eval(
    encodedMeasurement: bigint[],
    jointRand: bigint[],
    shares: number,
  ): bigint {
    this.ensureValidEval(encodedMeasurement, jointRand);
    const [firstRand] = jointRand;
    const [gadget] = this.gadgets;
    const [gadgetCalls] = this.gadgetCalls;
    const { field } = this;
    const { chunkLength } = this;
    const sharesInv = field.exp(BigInt(shares), -1n);

    return arr(gadgetCalls, (gadgetCall) =>
      arr(chunkLength, (chunk) => {
        const index = gadgetCall * chunkLength + chunk;
        const measurementElement = encodedMeasurement[index] || 0n;
        return [
          field.mul(
            field.exp(firstRand, BigInt(index + 1)),
            measurementElement,
          ),
          field.sub(measurementElement, sharesInv),
        ];
      }).flat(),
    ).reduce((sum, input) => field.add(sum, gadget.eval(field, input)), 0n);
  }

  encode(measurements: number[]): bigint[] {
    const { bits, max, length } = this;
    if (measurements.length !== length) {
      throw new Error(
        `length must be ${length} but was ${measurements.length}`,
      );
    }
    return measurements.flatMap((measurement) => {
      if (
        typeof measurement !== "number" ||
        measurement !== Math.trunc(measurement) ||
        measurement < 0 ||
        measurement >= this.max
      ) {
        throw new Error(
          `Measurement ${measurement} must a number in [0, ${max})`,
        );
      }

      return arr(bits, (bit) => BigInt((measurement >> bit) & 1));
    });
  }

  truncate(input: bigint[]): bigint[] {
    const { field, length, bits } = this;
    return arr(length, (i) =>
      arr(bits, (j) =>
        this.field.mul(BigInt(1 << j), input[i * bits + j]),
      ).reduce((sum, n) => field.add(sum, n)),
    );
  }

  decode(input: bigint[], _measurementCount: number): number[] {
    return input.map(Number);
  }
}
