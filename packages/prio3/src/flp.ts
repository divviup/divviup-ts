import { Field } from "@divviup/field";

export interface Flp<Measurement, AggResult> {
  jointRandLen: number;
  proveRandLen: number;
  queryRandLen: number;
  measurementLen: number;
  outputLen: number;
  proofLen: number;
  verifierLen: number;
  field: Field;

  encode(measurement: Measurement): bigint[];

  prove(
    encodedMeasurement: bigint[],
    proveRand: bigint[],
    jointRand: bigint[],
  ): bigint[];

  query(
    encodedMeasurement: bigint[],
    proof: bigint[],
    queryRand: bigint[],
    jointRand: bigint[],
    shares: number,
  ): bigint[];

  decide(verifier: bigint[]): boolean;

  truncate(encodedMeasurement: bigint[]): bigint[];

  decode(output: bigint[], numMeasurements: number): AggResult;
}
