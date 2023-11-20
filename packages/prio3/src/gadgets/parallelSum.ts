import type { Field } from "@divviup/field";
import { Gadget } from "../gadget.js";
import { arr } from "@divviup/common";

export class ParallelSum extends Gadget {
  arity: number;
  degree: number;
  constructor(
    public subcircuit: Gadget,
    public count: number,
  ) {
    super();
    this.arity = subcircuit.arity * count;
    this.degree = subcircuit.degree;
  }

  eval(field: Field, input: bigint[]): bigint {
    this.ensureArity(input);
    const { arity } = this.subcircuit;
    return arr(this.count, (i) =>
      this.subcircuit.eval(field, input.slice(i * arity, (i + 1) * arity)),
    ).reduce((sum, n) => field.add(sum, n));
  }

  evalPoly(field: Field, inputPolynomial: bigint[][]): bigint[] {
    this.ensurePolyArity(inputPolynomial);
    const { arity } = this.subcircuit;
    return stripPolynomial(
      arr(this.count, (i) =>
        this.subcircuit.evalPoly(
          field,
          inputPolynomial.slice(i * arity, (i + 1) * arity),
        ),
      ).reduce((output, outputs) => field.vecAdd(output, outputs)),
    );
  }
}

function stripPolynomial(polynomial: bigint[]): bigint[] {
  let index = polynomial.length - 1;
  while (index >= 0 && polynomial[index] == 0n) index--;
  return polynomial.slice(0, index + 1);
}
