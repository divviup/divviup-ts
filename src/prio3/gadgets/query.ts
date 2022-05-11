import { Field, Vector } from "field";
import { nextPowerOf2, arr } from "common";
import { Gadget } from "prio3/gadget";

export class Query implements Gadget {
  arity: number;
  degree: number;
  wire: bigint[][];
  gadget: Gadget;
  gadgetPoly: Vector;
  alpha: bigint;
  k = 0;

  constructor(
    field: Field,
    wireSeeds: bigint[],
    gadgetPoly: Vector,
    gadget: Gadget,
    gadgetCalls: number
  ) {
    this.degree = gadget.degree;
    this.gadget = gadget;
    this.arity = gadget.arity;
    this.wire = new Array(this.arity) as bigint[][];
    this.gadgetPoly = gadgetPoly;
    const p = nextPowerOf2(gadgetCalls + 1);

    for (let i = 0; i < this.arity; i++) {
      const wire = arr(p, () => 0n);
      wire[0] = wireSeeds[i];
      this.wire[i] = wire;
    }

    this.alpha = field.exp(field.generator, field.genOrder / BigInt(p));
  }

  eval(field: Field, input: Vector): bigint {
    this.k += 1;

    for (let j = 0; j < input.length; j++) {
      this.wire[j][this.k] = input.getValue(j);
    }

    return field.evalPoly(
      this.gadgetPoly,
      field.exp(this.alpha, BigInt(this.k))
    );
  }

  evalPoly(_field: Field, _inputPoly: unknown): Vector {
    throw new Error("evalPoly is not implemented for QueryGadget");
  }
}
