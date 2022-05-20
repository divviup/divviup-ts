import { Circuit } from "prio3/circuit";
import { Field128, Vector } from "field";
import { PolyEval } from "prio3/gadgets/polyEval";

export class Histogram extends Circuit<number> {
  gadgets = [new PolyEval([0n, -1n, 1n])];
  jointRandLen = 2;
  field = Field128;

  gadgetCalls: number[];
  inputLen: number;
  outputLen: number;

  buckets: number[];

  constructor(buckets: number[]) {
    super();
    this.buckets = buckets;
    this.gadgetCalls = [buckets.length + 1];
    this.inputLen = buckets.length + 1;
    this.outputLen = buckets.length + 1;
  }

  eval(input: Vector, jointRand: Vector, shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const inputValues = input.toValues();
    const [firstRand, secondRand] = jointRand.toValues();
    const [gadget] = this.gadgets;
    const f = this.field;

    const rangeCheck = f.sum(inputValues, (value, index) =>
      f.mul(f.exp(firstRand, BigInt(index)), gadget.eval(f, f.vec([value])))
    );

    const sumCheck = f.sum(
      [...inputValues, f.mul(-1n, f.exp(BigInt(shares), -1n))],
      (n) => n
    );

    return f.add(
      f.mul(secondRand, rangeCheck),
      f.mul(f.exp(secondRand, 2n), sumCheck)
    );
  }

  encode(measurement: number): Vector {
    const boundaries = [...this.buckets, Infinity];
    const encoded = boundaries.map(() => 0n);
    encoded[boundaries.findIndex((b) => measurement <= b)] = 1n;
    return this.field.vec(encoded);
  }

  truncate(input: Vector): Vector {
    return input;
  }
}
