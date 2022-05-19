import { Field, Vector } from "field";
import { arr, nextPowerOf2 } from "common";
import { Gadget } from "prio3/gadget";

export class Proof extends Gadget {
  gadget: Gadget;
  wire: bigint[][];
  callCount = 0;

  constructor(wireSeeds: bigint[], gadget: Gadget, calls: number) {
    super();
    this.gadget = gadget;
    const wirePolyLength = nextPowerOf2(1 + calls);
    this.wire = arr(this.arity, (i) => [
      wireSeeds[i],
      ...arr(wirePolyLength - 1, () => 0n),
    ]);
  }

  eval(field: Field, input: Vector): bigint {
    this.callCount += 1;

    this.wire.forEach((wire, index) => {
      wire[this.callCount] = input.getValue(index);
    });

    return this.gadget.eval(field, input);
  }

  evalPoly(field: Field, inputPoly: Vector[]): Vector {
    return this.gadget.evalPoly(field, inputPoly);
  }

  get arity(): number {
    return this.gadget.arity;
  }

  get degree(): number {
    return this.gadget.degree;
  }
}
