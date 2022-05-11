import { Field, Vector } from "field";
import { Gadget, ensureGadgetArity, ensureGadgetPolyArity } from "prio3/gadget";

export class Mul implements Gadget {
  arity = 2;
  degree = 2;

  eval(field: Field, input: Vector): bigint {
    ensureGadgetArity(this, input);
    return field.mul(input.getValue(0), input.getValue(1));
  }

  evalPoly(field: Field, inputPolynomial: Vector[]): Vector {
    ensureGadgetPolyArity(this, inputPolynomial);
    return field.mulPolys(inputPolynomial[0], inputPolynomial[1]);
  }
}
