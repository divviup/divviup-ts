import { Field, Vector } from "field";
import { nextPowerOf2 } from "common";
import { Gadget } from "prio3/gadget";

export class Proof extends Gadget {
  arity: number;
  degree: number;
  field: Field;
  wire: bigint[][];
  gadget: Gadget;
  k: number; // TODO(jbr): find out a better name for this

  constructor(
    field: Field,
    wireSeeds: bigint[],
    gadget: Gadget,
    calls: number
  ) {
    super();
    this.gadget = gadget;
    this.arity = gadget.arity;
    this.degree = gadget.degree;
    this.field = field;
    this.wire = [];
    this.wire.length = this.arity;
    this.k = 0;
    const p = nextPowerOf2(1 + calls);

    for (let i = 0; i < this.arity; i++) {
      const wire = new Array(p).fill(0n) as bigint[];
      wire[0] = wireSeeds[i];
      this.wire[i] = wire;
    }
  }

  eval(field: Field, input: Vector): bigint {
    this.k += 1;

    this.wire.forEach((wire, index) => {
      wire[this.k] = input.getValue(index);
    });

    return this.gadget.eval(field, input);
  }

  evalPoly(field: Field, inputPoly: Vector[]): Vector {
    return this.gadget.evalPoly(field, inputPoly);
  }
}
