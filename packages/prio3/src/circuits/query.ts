import { Circuit } from "../circuit.js";
import { Field } from "@divviup/field";
import { nextPowerOf2 } from "@divviup/common";
import { Query as QueryGadget } from "../gadgets/query.js";
export class Query<M, AR> extends Circuit<M, AR> {
  gadgets: QueryGadget[];
  circuit: Circuit<M, AR>;
  [key: string]: unknown;

  get gadgetCalls(): number[] {
    return this.circuit.gadgetCalls;
  }

  get measurementLen(): number {
    return this.circuit.measurementLen;
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

  eval(input: bigint[], jointRand: bigint[], shares: number): bigint {
    return this.circuit.eval.call(this, input, jointRand, shares);
  }

  encode(measurement: M): bigint[] {
    return this.circuit.encode.call(this, measurement);
  }

  truncate(input: bigint[]): bigint[] {
    return this.circuit.truncate.call(this, input);
  }

  decode(output: bigint[], measurementCount: number): AR {
    return this.circuit.decode(output, measurementCount);
  }

  constructor(circuit: Circuit<M, AR>, proof: bigint[]) {
    super();
    for (const key in circuit) {
      if (!(key in this)) {
        this[key] = circuit[key as keyof typeof circuit];
      }
    }

    this.circuit = circuit;
    let proofIndex = 0;

    this.gadgets = circuit.gadgets.map((gadget, i) => {
      const calls = circuit.gadgetCalls[i];
      const p = nextPowerOf2(calls + 1);
      const gadgetPolyLen = gadget.degree * (p - 1) + 1;

      const wireSeeds = proof.slice(proofIndex, (proofIndex += gadget.arity));
      const gadgetPoly = proof.slice(proofIndex, (proofIndex += gadgetPolyLen));

      return new QueryGadget(
        circuit.field,
        wireSeeds,
        gadgetPoly,
        gadget,
        calls,
      );
    });

    if (proof.length !== this.proofLen) {
      throw new Error(
        `expected proof length to be ${this.proofLen} but it was ${proof.length}`,
      );
    }

    if (proofIndex !== proof.length) {
      throw new Error(
        `did not use all of proof (used ${proofIndex}/${proof.length})`,
      );
    }
  }
}
