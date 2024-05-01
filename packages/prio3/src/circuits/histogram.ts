import { Circuit } from "../circuit.js";
import { Field } from "@divviup/field";
import { Mul } from "../gadgets/mul.js";
import { arr } from "@divviup/common";
import { ParallelSum } from "../gadgets/parallelSum.js";
import type { Gadget } from "../gadget.js";

export class Histogram extends Circuit<number, number[]> {
  gadgets: Gadget[];
  jointRandLen = 2;

  gadgetCalls: number[];
  measurementLen: number;
  outputLen: number;

  length: number;
  chunkLength: number;

  constructor(
    public readonly field: Field,
    length: number,
    chunkLength: number,
  ) {
    super();

    if (
      typeof length !== "number" ||
      Math.trunc(length) !== length ||
      length <= 0
    ) {
      throw new Error("invalid histogram length");
    }
    if (
      typeof chunkLength !== "number" ||
      Math.trunc(chunkLength) !== chunkLength ||
      chunkLength <= 0
    ) {
      throw new Error("invalid histogram chunk length");
    }
    this.gadgets = [new ParallelSum(new Mul(), chunkLength)];
    this.length = length;
    this.chunkLength = chunkLength;
    this.gadgetCalls = [Math.floor((length + chunkLength - 1) / chunkLength)];
    this.measurementLen = length;
    this.outputLen = length;
  }

  eval(
    encodedMeasurement: bigint[],
    jointRand: bigint[],
    shares: number,
  ): bigint {
    this.ensureValidEval(encodedMeasurement, jointRand);
    const [firstRand, secondRand] = jointRand;
    const [gadget] = this.gadgets;
    const [gadgetCalls] = this.gadgetCalls;
    const { field } = this;
    const { chunkLength } = this;
    const sharesInv = field.exp(BigInt(shares), -1n);

    const rangeCheck = arr(gadgetCalls, (gadgetCall) =>
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

    const sumCheck = encodedMeasurement.reduce(
      (sumCheck, measurement) => field.add(sumCheck, measurement),
      field.mul(sharesInv, -1n),
    );

    return field.add(
      field.mul(secondRand, rangeCheck),
      field.mul(field.exp(secondRand, 2n), sumCheck),
    );
  }

  encode(measurement: number): bigint[] {
    if (
      typeof measurement === "number" &&
      measurement === Math.trunc(measurement) &&
      measurement >= 0 &&
      measurement < this.length
    ) {
      return arr(this.length, (i) => (i === measurement ? 1n : 0n));
    } else {
      throw new Error(`Measurement ${measurement} must an integer in [0, ${this.length}).

Note: As of VDAF-07, Histogram now takes the bucket *index*, not the raw value.
`);
    }
  }

  truncate(input: bigint[]): bigint[] {
    return input;
  }

  decode(input: bigint[], _measurementCount: number): number[] {
    return input.map(Number);
  }
}
