import { Field, Vector } from "field";
import { Gadget } from "prio3/gadget";

export class Mul extends Gadget {
  arity = 2;
  degree = 2;

  eval(field: Field, input: Vector): bigint {
    this.ensureArity(input);
    return field.mul(input.getValue(0), input.getValue(1));
  }

  evalPoly(field: Field, inputPolynomial: Vector[]): Vector {
    this.ensurePolyArity(inputPolynomial);
    return field.mulPolys(inputPolynomial[0], inputPolynomial[1]);
  }
}
