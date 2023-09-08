import { Field } from "@divviup/field";
import { arr, fill, nextPowerOf2 } from "@divviup/common";
import { Gadget } from "../gadget.js";

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
      ...fill(wirePolyLength - 1, 0n),
    ]);
  }

  eval(field: Field, input: bigint[]): bigint {
    this.callCount += 1;

    this.wire.forEach((wire, index) => {
      wire[this.callCount] = input[index];
    });

    return this.gadget.eval(field, input);
  }

  evalPoly(field: Field, inputPoly: bigint[][]): bigint[] {
    return this.gadget.evalPoly(field, inputPoly);
  }

  get arity(): number {
    return this.gadget.arity;
  }

  get degree(): number {
    return this.gadget.degree;
  }
}
