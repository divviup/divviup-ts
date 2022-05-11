import { arr } from "common";
import { Field, Vector } from "field";
import { Gadget, ensureGadgetArity, ensureGadgetPolyArity } from "prio3/gadget";

function stripPoly(poly: bigint[]): bigint[] {
  let index = poly.length - 1;
  while (index >= 0 && poly[index] == 0n) index--;
  return poly.slice(0, index + 1);
}

export class PolyEval implements Gadget {
  arity = 1;
  p: bigint[];
  degree: number;

  constructor(p: bigint[]) {
    p = stripPoly(p);

    if (p.length === 0) {
      throw new Error("invalid polynomial: zero length");
    }

    this.p = p.map(BigInt);
    this.degree = p.length - 1;
  }

  eval(field: Field, input: Vector): bigint {
    ensureGadgetArity(this, input);

    return field.evalPoly(field.vec(this.p), input.getValue(0));
  }

  evalPoly(field: Field, inputPolynomial: Vector[]): Vector {
    ensureGadgetPolyArity(this, inputPolynomial);

    const out = arr(this.degree * inputPolynomial[0].length, () => 0n);
    out[0] = this.p[0];

    let x = inputPolynomial[0];

    for (let i = 1; i < this.p.length; i++) {
      for (let j = 0; j < x.length; j++) {
        out[j] = field.add(out[j], field.mul(this.p[i], x.getValue(j)));
      }

      x = field.mulPolys(x, inputPolynomial[0]);
    }

    return field.vec(stripPoly(out));
  }
}
