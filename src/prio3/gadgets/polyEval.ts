import { arr } from "common";
import { Field } from "field";
import { Gadget } from "prio3/gadget";

function stripPolynomial(polynomial: bigint[]): bigint[] {
  let index = polynomial.length - 1;
  while (index >= 0 && polynomial[index] == 0n) index--;
  return polynomial.slice(0, index + 1);
}

export class PolyEval extends Gadget {
  arity = 1;
  polynomial: bigint[];
  degree: number;

  constructor(polynomial: bigint[]) {
    super();
    polynomial = stripPolynomial(polynomial);

    if (polynomial.length === 0) {
      throw new Error("invalid polynomial: zero length");
    }

    this.polynomial = polynomial.map(BigInt);
    this.degree = polynomial.length - 1;
  }

  eval(field: Field, input: bigint[]): bigint {
    this.ensureArity(input);

    return field.evalPoly(field.vec(this.polynomial), input[0]);
  }

  evalPoly(field: Field, inputPolynomial: bigint[][]): bigint[] {
    this.ensurePolyArity(inputPolynomial);

    const out = arr(this.degree * inputPolynomial[0].length, () => 0n);
    out[0] = this.polynomial[0];

    let x = inputPolynomial[0];

    for (let i = 1; i < this.polynomial.length; i++) {
      for (let j = 0; j < x.length; j++) {
        out[j] = field.add(out[j], field.mul(this.polynomial[i], x[j]));
      }

      x = field.mulPolys(x, inputPolynomial[0]);
    }

    return field.vec(stripPolynomial(out));
  }
}
