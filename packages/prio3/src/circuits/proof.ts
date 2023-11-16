import { Circuit } from "../circuit.js";
import { Field } from "@divviup/field";
import { Proof as ProofGadget } from "../gadgets/proof.js";

export class Proof<M, AR> extends Circuit<M, AR> {
  gadgets: ProofGadget[];
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

  constructor(circuit: Circuit<M, AR>, proveRand: bigint[]) {
    super();

    for (const key in circuit) {
      if (!(key in this)) {
        this[key] = circuit[key as keyof typeof circuit];
      }
    }

    this.circuit = circuit;
    if (proveRand.length != circuit.proveRandLen) {
      throw new Error("prove rand was not the correct length");
    }

    let proveRandIndex = 0;

    this.gadgets = circuit.gadgets.map(
      (gadget, index) =>
        new ProofGadget(
          proveRand.slice(proveRandIndex, (proveRandIndex += gadget.arity)),
          gadget,
          this.gadgetCalls[index],
        ),
    );

    if (proveRand.length !== proveRandIndex) {
      throw new Error("did not use all of the proof randomness");
    }
  }
}
