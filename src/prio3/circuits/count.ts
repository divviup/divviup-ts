import { Circuit } from "prio3/circuit";
import { Field64 } from "field";
import { Mul } from "prio3/gadgets/mul";

export class Count extends Circuit<boolean> {
  gadgets = [new Mul()];
  gadgetCalls = [1];
  inputLen = 1;
  jointRandLen = 0;
  outputLen = 1;
  field = Field64;

  eval(input: bigint[], jointRand: bigint[], _shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const { field } = this;
    const [inputZero] = input;
    const [mul] = this.gadgets;
    return field.sub(mul.eval(field, [inputZero, inputZero]), inputZero);
  }

  encode(measurement: boolean): bigint[] {
    if (typeof measurement !== "boolean") {
      throw new Error("expected count measurement to be a boolean");
    }

    return [measurement ? 1n : 0n];
  }

  truncate(input: bigint[]): bigint[] {
    if (input.length !== 1) {
      throw new Error("expected Count input to be exactly one boolean");
    }

    return input;
  }
}
