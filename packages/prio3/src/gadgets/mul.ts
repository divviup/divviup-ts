import { Field } from "@divviup/field";
import { Gadget } from "../gadget.js";

export class Mul extends Gadget {
  arity = 2;
  degree = 2;

  eval(field: Field, input: bigint[]): bigint {
    this.ensureArity(input);
    return field.mul(input[0], input[1]);
  }

  evalPoly(field: Field, inputPolynomial: bigint[][]): bigint[] {
    this.ensurePolyArity(inputPolynomial);
    return field.mulPolys(inputPolynomial[0], inputPolynomial[1]);
  }
}
