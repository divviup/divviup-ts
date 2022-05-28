import { Field } from "@divviup/field";

export abstract class Gadget {
  abstract arity: number;
  abstract degree: number;
  abstract eval(field: Field, input: bigint[]): bigint;
  abstract evalPoly(field: Field, inputPolynomial: bigint[][]): bigint[];

  ensureArity(input: bigint[]) {
    if (input.length !== this.arity) {
      throw new Error(
        `expected gadget input length (${input.length}) to equal arity (${this.arity}), but it did not`
      );
    }
  }

  ensurePolyArity(inputPoly: bigint[][]) {
    if (
      inputPoly.length !== this.arity ||
      inputPoly.find((p) => p.length !== inputPoly[0].length)
    ) {
      throw new Error("expected gadget input to equal arity, but it did not");
    }
  }
}
