import { Field, Vector } from "field";

export interface Flp<M> {
  jointRandLen: number;
  proveRandLen: number;
  queryRandLen: number;
  inputLen: number;
  outputLen: number;
  proofLen: number;
  verifierLen: number;
  field: Field;

  encode(measurement: M): Vector;

  prove(input: Vector, proveRand: Vector, jointRand: Vector): Vector;

  query(
    input: Vector,
    proof: Vector,
    queryRand: Vector,
    jointRand: Vector,
    shares: number
  ): Vector;

  decide(input: Vector): boolean;

  truncate(input: Vector): Vector;
}
