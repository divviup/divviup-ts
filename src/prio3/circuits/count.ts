import { Circuit } from "prio3/circuit";
import { Field64, Vector } from "field";
import { Mul } from "prio3/gadgets/mul";

export class Count extends Circuit<number> {
  gadgets = [new Mul()];
  gadgetCalls = [1];
  inputLen = 1;
  jointRandLen = 0;
  outputLen = 1;
  field = Field64;

  eval(input: Vector, jointRand: Vector, _shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const inputZero = input.getValue(0);
    const [mul] = this.gadgets;
    return this.field.sub(
      mul.eval(this.field, this.field.vec([inputZero, inputZero])),
      inputZero
    );
  }

  encode(measurement: number): Vector {
    if (![0, 1].includes(measurement)) {
      throw new Error("expected count measurement to be a zero or one");
    }

    return this.field.vec([BigInt(measurement)]);
  }

  truncate(input: Vector): Vector {
    if (input.length !== 1) {
      throw new Error("expected Count input to be exactly one bigint");
    }

    return input;
  }
}
