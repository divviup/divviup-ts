import type { Field } from "@divviup/field";
import { Gadget } from "./gadget.js";
import { nextPowerOf2 } from "@divviup/common";

export interface GenericCircuit {
  field: Field;
  jointRandLen: number;
  measurementLen: number;
  outputLen: number;
  proveRandLen: number;
  queryRandLen: number;
  proofLen: number;
  verifierLen: number;
  gadgets: Gadget[];
  gadgetCalls: number[];

  eval(input: bigint[], jointRand: bigint[], shares: number): bigint;
  encode(measurement: unknown): bigint[];
  truncate(input: bigint[]): bigint[];
  decode(output: bigint[], measurementCount: number): unknown;
}

export abstract class Circuit<M, AR> implements GenericCircuit {
  abstract field: Field;
  abstract jointRandLen: number;
  abstract measurementLen: number;
  abstract outputLen: number;
  abstract gadgets: Gadget[];
  abstract gadgetCalls: number[];

  abstract eval(input: bigint[], jointRand: bigint[], shares: number): bigint;
  abstract encode(measurement: M): bigint[];
  abstract truncate(input: bigint[]): bigint[];
  abstract decode(output: bigint[], measurementCount: number): AR;

  get proveRandLen(): number {
    return this.gadgets.reduce((sum, gadget) => sum + gadget.arity, 0);
  }

  get queryRandLen(): number {
    return this.gadgets.length;
  }

  get proofLen(): number {
    return this.gadgets.reduce((length, gadget, i) => {
      const calls = this.gadgetCalls[i];
      const p = nextPowerOf2(calls + 1);
      return length + gadget.arity + gadget.degree * (p - 1) + 1;
    }, 0);
  }

  get verifierLen(): number {
    return this.gadgets.reduce((sum, gadget) => sum + gadget.arity + 1, 1);
  }

  ensureValidEval(encodedMeasurement: bigint[], jointRand: bigint[]) {
    if (encodedMeasurement.length != this.measurementLen) {
      throw new Error(
        `expected measurement length to be ${this.measurementLen} but it was ${encodedMeasurement.length}`,
      );
    }

    if (jointRand.length != this.jointRandLen) {
      throw new Error(
        `expected joint rand length to be ${this.jointRandLen} but it was ${jointRand.length}`,
      );
    }
  }
}
