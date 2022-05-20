import { Circuit } from "prio3/circuit";
import { Field128, Vector } from "field";
import { PolyEval } from "prio3/gadgets/polyEval";
import { arr } from "common";

export class Sum extends Circuit<number> {
  gadgets = [new PolyEval([0n, -1n, 1n])];
  gadgetCalls: number[];
  inputLen: number;
  jointRandLen = 1;
  outputLen = 1;
  field = Field128;

  constructor(bits: number) {
    super();
    if (2n ** BigInt(bits) >= this.field.modulus)
      throw new Error("bit size exceeds field modulus");
    this.gadgetCalls = [bits];
    this.inputLen = bits;
  }

  eval(input: Vector, jointRand: Vector, _shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const [gadget] = this.gadgets;
    const field = this.field;
    const jointRandZero = jointRand.getValue(0);

    return input
      .toValues()
      .reduce(
        (out, inputValue, index) =>
          field.add(
            out,
            field.mul(
              field.exp(jointRandZero, BigInt(index)),
              gadget.eval(field, field.vec([inputValue]))
            )
          ),
        0n
      );
  }

  encode(measurement: number): Vector {
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

    return this.field.vec(
      arr(this.inputLen, (l) => BigInt((measurement >> l) & 1))
    );
  }

  truncate(input: Vector): Vector {
    const field = this.field;
    const trunc = field.vec([
      input
        .toValues()
        .reduce(
          (decoded, b, l) =>
            field.add(decoded, field.mul(field.exp(2n, BigInt(l)), b)),
          0n
        ),
    ]);

    return trunc;
  }
}
