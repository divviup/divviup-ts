import { arr } from "common";
import { Flp } from "prio3/flp";
import { Field } from "field";
import { Circuit } from "prio3/circuit";
import { Query } from "prio3/circuits/query";
import { Proof } from "prio3/circuits/proof";

export class FlpGeneric<M> implements Flp<M> {
  constructor(public circuit: Circuit<M>) {}

  get jointRandLen(): number {
    return this.circuit.jointRandLen;
  }

  get proveRandLen(): number {
    return this.circuit.proveRandLen;
  }

  get queryRandLen(): number {
    return this.circuit.queryRandLen;
  }

  get inputLen(): number {
    return this.circuit.inputLen;
  }

  get outputLen(): number {
    return this.circuit.outputLen;
  }

  get proofLen(): number {
    return this.circuit.proofLen;
  }

  get verifierLen(): number {
    return this.circuit.verifierLen;
  }

  get field(): Field {
    return this.circuit.field;
  }

  prove(input: bigint[], proveRand: bigint[], jointRand: bigint[]): bigint[] {
    const circuit = new Proof(this.circuit, proveRand);
    const { field } = this;
    circuit.eval(input, jointRand, 1);

    return field.vec(
      circuit.gadgets.flatMap((gadget) => {
        const p = gadget.wire[0].length;

        const alpha = field.exp(
          this.field.generator,
          this.field.genOrder / BigInt(p)
        );

        const wireInputs = field.vec(
          arr(p, (k) => field.exp(alpha, BigInt(k)))
        );

        const wirePolys = arr(gadget.arity, (j) =>
          this.field.interpolate(wireInputs, field.vec(gadget.wire[j]))
        );

        const gadgetPoly = gadget.evalPoly(field, wirePolys);

        return gadget.wire.map((wire) => wire[0]).concat(gadgetPoly);
      })
    );
  }

  encode(measurement: M): bigint[] {
    return this.circuit.encode(measurement);
  }

  truncate(input: bigint[]): bigint[] {
    return this.circuit.truncate(input);
  }

  query(
    input: bigint[],
    proof: bigint[],
    queryRand: bigint[],
    jointRand: bigint[],
    shares: number
  ): bigint[] {
    const circuit = new Query(this.circuit, proof);
    const v = circuit.eval(input, jointRand, shares);
    const { field } = this;

    if (queryRand.length !== this.circuit.queryRandLen) {
      throw new Error(
        `mismatched query rand length. expected ${this.circuit.queryRandLen} but got ${queryRand.length}`
      );
    }

    return field.vec(
      circuit.gadgets.reduce(
        (verifier, gadget, index) => {
          const t = queryRand[index];
          const p = gadget.wire[0].length;

          if (field.exp(t, BigInt(p)) == 1n) {
            throw new Error(
              "Degenerate point would leak gadget output to the verifier"
            );
          }

          const wireInput = field.vec(
            arr(p, (k) => field.exp(gadget.alpha, BigInt(k)))
          );

          return [
            ...verifier,
            ...gadget.wire.map((wire) =>
              field.evalPoly(field.interpolate(wireInput, field.vec(wire)), t)
            ),
            field.evalPoly(gadget.gadgetPoly, t),
          ];
        },
        [v]
      )
    );
  }

  decide(verifier: bigint[]): boolean {
    if (verifier.length !== this.circuit.verifierLen) {
      throw new Error(
        `expected verifier of length ${this.circuit.verifierLen} but got ${verifier.length}`
      );
    }

    if (verifier[0] !== 0n) {
      return false;
    }
    let verifierIndex = 1;

    for (const gadget of this.circuit.gadgets) {
      const x = verifier.slice(verifierIndex, (verifierIndex += gadget.arity));
      const y = verifier[verifierIndex];
      const z = gadget.eval(this.field, this.field.vec(x));
      if (z != y) {
        return false;
      }
      verifierIndex += 1;
    }

    if (verifierIndex != this.circuit.verifierLen) {
      throw new Error(
        `unused verifier (${verifierIndex} / ${this.circuit.verifierLen})`
      );
    }

    return true;
  }
}
