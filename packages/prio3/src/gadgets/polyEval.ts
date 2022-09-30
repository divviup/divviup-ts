import { fill } from "@divviup/common";
import { Field } from "@divviup/field";
import { Gadget } from "../gadget";

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

    return field.evalPoly(this.polynomial, input[0]);
  }

  evalPoly(field: Field, inputPolynomial: bigint[][]): bigint[] {
    this.ensurePolyArity(inputPolynomial);

    const out = fill(this.degree * (inputPolynomial[0].length - 1) + 1, 0n);
    out[0] = this.polynomial[0];

    let x = inputPolynomial[0];

    for (let i = 1; i < this.polynomial.length; i++) {
      for (let j = 0; j < x.length; j++) {
        out[j] = field.add(out[j], field.mul(this.polynomial[i], x[j]));
      }

      x = field.mulPolys(x, inputPolynomial[0]);
    }

    return stripPolynomial(out);
  }
}
