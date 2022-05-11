import assert from "assert";
import { Field, Field128, Vector } from "field";
import { Flp } from "prio3/flp";

export function runFlp<M>(flp: Flp<M>, input: Vector, shares: number): boolean {
  const jointRand = flp.field.fillRandom(flp.jointRandLen);
  const proveRand = flp.field.fillRandom(flp.proveRandLen);
  const queryRand = flp.field.fillRandom(flp.queryRandLen);

  const proof = flp.prove(input, proveRand, jointRand);
  const verifier = flp.query(input, proof, queryRand, jointRand, shares);

  return flp.decide(verifier);
}

class TestFlp implements Flp<number> {
  jointRandLen = 1;
  proveRandLen = 2;
  queryRandLen = 3;
  inputLen = 2;
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

  encode(measurement: number): Vector {
    if (this.inRange(measurement)) {
      return this.field.vec([BigInt(measurement), BigInt(measurement)]);
    } else {
      throw new Error("encode");
    }
  }

  prove(input: Vector, _queryRand: Vector, _jointRand: Vector): Vector {
    return input;
  }

  decide(verifier: Vector): boolean {
    if (verifier.length !== 2) return false;
    const value0 = verifier.getValue(0);
    return value0 === verifier.getValue(1) && this.inRange(Number(value0));
  }

  query(
    input: Vector,
    _proof: Vector,
    _queryRand: Vector,
    _jointRand: Vector,
    _shares: number
  ): Vector {
    return input;
  }

  truncate(input: Vector): Vector {
    return this.field.vec([input.getValue(0)]);
  }
}

export class TestFlp128 extends TestFlp {
  constructor() {
    super(Field128);
  }
}

describe("flp", () => {
  it("passes a very simple test", () => {
    const flp = new TestFlp128();
    assert(runFlp(flp, flp.encode(0), 1));
    assert(runFlp(flp, flp.encode(4), 1));
    assert(!runFlp(flp, Field128.vec([BigInt(1337)]), 1));
  });
});
