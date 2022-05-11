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
    const inputArr = input.toValues();
    const [jr0, jr1] = jointRand.toValues();
    const [gadget] = this.gadgets;
    const f = this.field;

    const { rangeCheck, sumCheck } = inputArr.reduce(
      ({ rangeCheck, sumCheck, r }, b) => ({
        rangeCheck: f.add(rangeCheck, f.mul(r, gadget.eval(f, f.vec([b])))),
        r: f.mul(r, jr0),
        sumCheck: f.add(sumCheck, b),
      }),
      {
        rangeCheck: 0n,
        r: jr0,
        sumCheck: f.mul(-1n, f.exp(BigInt(shares), -1n)),
      }
    );

    return f.add(f.mul(jr1, rangeCheck), f.mul(f.exp(jr1, 2n), sumCheck));
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
