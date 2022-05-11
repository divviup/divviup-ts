import { Field, Vector } from "field";

export interface Gadget {
  arity: number;
  degree: number;
  eval(field: Field, input: Vector): bigint;
  evalPoly(field: Field, inputPolynomial: Vector[]): Vector;
}

export function ensureGadgetArity(gadget: Gadget, input: Vector) {
  if (input.length !== gadget.arity) {
    throw new Error(
      `expected gadget input length (${input.length}) to equal arity (${gadget.arity}), but it did not`
    );
  }
}

export function ensureGadgetPolyArity(gadget: Gadget, inputPoly: Vector[]) {
  if (
    inputPoly.length !== gadget.arity ||
    inputPoly.find((p) => p.length !== inputPoly[0].length)
  ) {
    throw new Error("expected gadget input to equal arity, but it did not");
  }
}
