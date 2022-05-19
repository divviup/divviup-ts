import { Circuit } from "prio3/circuit";
import { Field, Vector } from "field";
import { Proof as ProofGadget } from "prio3/gadgets/proof";

export class Proof<M> extends Circuit<M> {
  gadgets: ProofGadget[];
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

  constructor(circuit: Circuit<M>, proveRand: Vector) {
    super();

    this.circuit = circuit;
    if (proveRand.length != circuit.proveRandLen) {
      throw new Error("prove rand was not the correct length");
    }

    const proveRandValues = proveRand.toValues();
    let proveRandIndex = 0;

    this.gadgets = circuit.gadgets.map(
      (gadget, index) =>
        new ProofGadget(
          proveRandValues.slice(
            proveRandIndex,
            (proveRandIndex += gadget.arity)
          ),
          gadget,
          this.gadgetCalls[index]
        )
    );

    if (proveRandValues.length !== proveRandIndex) {
      throw new Error("did not use all of the proof randomness");
    }
  }
}
