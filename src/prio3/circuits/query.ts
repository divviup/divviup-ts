import { Circuit } from "prio3/circuit";
import { Field, Vector } from "field";
import { nextPowerOf2 } from "common";
import { Query as QueryGadget } from "prio3/gadgets/query";

export class Query<M> extends Circuit<M> {
  gadgets: QueryGadget[];
  circuit: Circuit<M>;

  get gadgetCalls(): number[] {
    return this.circuit.gadgetCalls;
  }

  get inputLen(): number {
    return this.circuit.inputLen;
  }

  get outputLen(): number {
    return this.circuit.outputLen;
  }

  get field(): Field {
    return this.circuit.field;
  }

  get jointRandLen(): number {
    return this.circuit.jointRandLen;
  }

  eval(input: Vector, jointRand: Vector, shares: number): bigint {
    return this.circuit.eval.call(this, input, jointRand, shares);
  }

  encode(measurement: M): Vector {
    return this.circuit.encode.call(this, measurement);
  }

  truncate(input: Vector): Vector {
    return this.circuit.truncate.call(this, input);
  }

  constructor(circuit: Circuit<M>, proof: Vector) {
    super();

    this.circuit = circuit;
    const proofValues = proof.toValues();
    let proofIndex = 0;

    this.gadgets = circuit.gadgets.map((gadget, i) => {
      const calls = circuit.gadgetCalls[i];
      const p = nextPowerOf2(calls + 1);
      const gadgetPolyLen = gadget.degree * (p - 1) + 1;

      const wireSeeds = proofValues.slice(
        proofIndex,
        (proofIndex += gadget.arity)
      );

      const gadgetPoly = circuit.field.vec(
        proofValues.slice(proofIndex, (proofIndex += gadgetPolyLen))
      );

      return new QueryGadget(
        circuit.field,
        wireSeeds,
        gadgetPoly,
        gadget,
        calls
      );
    });

    if (proof.length !== this.proofLen) {
      throw new Error(
        `expected proof length to be ${this.proofLen} but it was ${proof.length}`
      );
    }

    if (proofIndex !== proofValues.length) {
      throw new Error(
        `did not use all of proof (used ${proofIndex}/${proofValues.length})`
      );
    }
  }
}
