import { Field } from "@divviup/field";

export interface Flp<Measurement, AggResult> {
  jointRandLen: number;
  proveRandLen: number;
  queryRandLen: number;
  inputLen: number;
  outputLen: number;
  proofLen: number;
  verifierLen: number;
  field: Field;

  encode(measurement: Measurement): bigint[];

  prove(input: bigint[], proveRand: bigint[], jointRand: bigint[]): bigint[];

  query(
    input: bigint[],
    proof: bigint[],
    queryRand: bigint[],
    jointRand: bigint[],
    shares: number,
  ): bigint[];

  decide(input: bigint[]): boolean;

  truncate(input: bigint[]): bigint[];

  decode(output: bigint[], num_measurements: number): AggResult;
}
