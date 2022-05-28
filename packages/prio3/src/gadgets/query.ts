import { Field } from "@divviup/field";
import { nextPowerOf2, arr, fill } from "@divviup/common";
import { Gadget } from "../gadget";

export class Query extends Gadget {
  wire: bigint[][];
  gadget: Gadget;
  gadgetPoly: bigint[];
  alpha: bigint;
  callCount = 0;

  constructor(
    field: Field,
    wireSeeds: bigint[],
    gadgetPoly: bigint[],
    gadget: Gadget,
    calls: number
  ) {
    super();
    this.gadget = gadget;
    this.gadgetPoly = gadgetPoly;
    const wirePolyLength = nextPowerOf2(calls + 1);

    this.wire = arr(this.arity, (i) => [
      wireSeeds[i],
      ...fill(wirePolyLength - 1, 0n),
    ]);

    this.alpha = field.exp(
      field.generator,
      field.genOrder / BigInt(wirePolyLength)
    );
  }

  eval(field: Field, input: bigint[]): bigint {
    this.callCount += 1;

    this.wire.forEach((wire, index) => {
      wire[this.callCount] = input[index];
    });

    return field.evalPoly(
      this.gadgetPoly,
      field.exp(this.alpha, BigInt(this.callCount))
    );
  }

  evalPoly(_field: Field, _inputPoly: unknown): bigint[] {
    throw new Error("evalPoly is not implemented for QueryGadget");
  }

  get arity(): number {
    return this.gadget.arity;
  }

  get degree(): number {
    return this.gadget.degree;
  }
}
