import { Circuit } from "../circuit";
import { Field128 } from "@divviup/field";
import { PolyEval } from "../gadgets/polyEval";
import { arr } from "@divviup/common";

export class Sum extends Circuit<number> {
  gadgets = [new PolyEval([0n, -1n, 1n])];
  gadgetCalls: number[];
  inputLen: number;
  jointRandLen = 1;
  outputLen = 1;
  field = new Field128();

  constructor(bits: number) {
    super();
    if (2n ** BigInt(bits) >= this.field.modulus) {
      throw new Error("bit size exceeds field modulus");
    }

    this.gadgetCalls = [bits];
    this.inputLen = bits;
  }

  eval(input: bigint[], jointRand: bigint[], _shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const [poly] = this.gadgets;
    const field = this.field;
    const jointRandZero = jointRand[0];

    return field.sum(input, (value, index) =>
      field.mul(
        field.exp(jointRandZero, BigInt(index)),
        poly.eval(field, [value])
      )
    );
  }

  encode(measurement: number): bigint[] {
    if (
      measurement !== Math.floor(measurement) ||
      measurement < 0 ||
      measurement >= 2 ** this.inputLen
    ) {
      throw new Error(
        `measurement ${measurement} was not an integer in [0, ${
          2 ** this.inputLen
        })`
      );
    }

    return arr(this.inputLen, (index) => BigInt((measurement >> index) & 1));
  }

  truncate(input: bigint[]): bigint[] {
    const field = this.field;
    return [
      field.sum(input, (value, index) =>
        field.mul(field.exp(2n, BigInt(index)), value)
      ),
    ];
  }
}
