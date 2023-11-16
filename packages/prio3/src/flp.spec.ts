import assert from "assert";
import { Field, Field128 } from "@divviup/field";
import type { Flp } from "./flp.js";
import { fill, zip } from "@divviup/common";

export function runFlp<M, AR>(
  flp: Flp<M, AR>,
  encodedMeasurement: bigint[],
  shares: number,
): boolean {
  const { field } = flp;
  const jointRand = field.fillRandom(flp.jointRandLen);
  const proveRand = field.fillRandom(flp.proveRandLen);
  const queryRand = field.fillRandom(flp.queryRandLen);

  const proof = flp.prove(encodedMeasurement, proveRand, jointRand);
  const measurementShares = field.additiveSecretShare(
    encodedMeasurement,
    shares,
  );
  const proofShares = field.additiveSecretShare(proof, shares);
  const verifierShares = zip(measurementShares, proofShares).map(
    ([measurementShare, proofShare]) =>
      flp.query(measurementShare, proofShare, queryRand, jointRand, shares),
  );
  const verifier = verifierShares.reduce(
    (verifier, share) => field.vecAdd(verifier, share),
    fill(verifierShares[0].length, 0n),
  );

  return flp.decide(verifier);
}

class TestFlp implements Flp<number, number> {
  jointRandLen = 1;
  proveRandLen = 2;
  queryRandLen = 3;
  measurementLen = 2;
  outputLen = 1;
  proofLen = 2;
  verifierLen = 2;
  inputRange = { min: 0, max: 5 };
  field: Field;

  constructor(field: Field) {
    this.field = field;
  }

  inRange(n: number): boolean {
    const { min, max } = this.inputRange;
    return n >= min && n < max;
  }

  encode(measurement: number): bigint[] {
    if (this.inRange(measurement)) {
      return [BigInt(measurement), BigInt(measurement)];
    } else {
      throw new Error("encode");
    }
  }

  prove(input: bigint[], _queryRand: bigint[], _jointRand: bigint[]): bigint[] {
    return input;
  }

  decide(verifier: bigint[]): boolean {
    if (verifier.length !== 2) return false;
    const value0 = verifier[0];
    return value0 === verifier[1] && this.inRange(Number(value0));
  }

  query(
    input: bigint[],
    _proof: bigint[],
    _queryRand: bigint[],
    _jointRand: bigint[],
    _shares: number,
  ): bigint[] {
    return input;
  }

  truncate(input: bigint[]): bigint[] {
    return [input[0]];
  }

  decode(output: bigint[], _num_measurements: number): number {
    return Number(output[0]);
  }
}

export class TestFlp128 extends TestFlp {
  constructor() {
    super(new Field128());
  }
}

describe("flp", () => {
  it("passes a very simple test", () => {
    const flp = new TestFlp128();
    assert(runFlp(flp, flp.encode(0), 1));
    assert(runFlp(flp, flp.encode(4), 1));
    assert(!runFlp(flp, [BigInt(1337)], 1));
  });
});
