import { Circuit } from "../circuit";
import { Field128 } from "@divviup/field";
import { PolyEval } from "../gadgets/polyEval";

export class Histogram extends Circuit<number> {
  gadgets = [new PolyEval([0n, -1n, 1n])];
  jointRandLen = 2;
  field = new Field128();

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

  eval(input: bigint[], jointRand: bigint[], shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const [firstRand, secondRand] = jointRand;
    const [gadget] = this.gadgets;
    const f = this.field;

    const rangeCheck = f.sum(input, (value, index) =>
      f.mul(f.exp(firstRand, BigInt(index + 1)), gadget.eval(f, [value]))
    );

    const sumCheck = f.sum(
      [...input, f.mul(-1n, f.exp(BigInt(shares), -1n))],
      (n) => n
    );

    return f.add(
      f.mul(secondRand, rangeCheck),
      f.mul(f.exp(secondRand, 2n), sumCheck)
    );
  }

  encode(measurement: number): bigint[] {
    const boundaries = [...this.buckets, Infinity];
    const encoded = boundaries.map(() => 0n);
    encoded[boundaries.findIndex((b) => measurement <= b)] = 1n;
    return encoded;
  }

  truncate(input: bigint[]): bigint[] {
    return input;
  }
}
