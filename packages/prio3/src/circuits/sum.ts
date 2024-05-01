import { Circuit } from "../circuit.js";
import { Field } from "@divviup/field";
import { PolyEval } from "../gadgets/polyEval.js";
import { arr } from "@divviup/common";

export class Sum extends Circuit<number | bigint, bigint> {
  gadgets = [new PolyEval([0n, -1n, 1n])];
  gadgetCalls: number[];
  measurementLen: number;
  jointRandLen = 1;
  outputLen = 1;

  constructor(
    public readonly field: Field,
    bits: number,
  ) {
    super();
    if (2n ** BigInt(bits) >= this.field.modulus) {
      throw new Error("bit size exceeds field modulus");
    }

    this.gadgetCalls = [bits];
    this.measurementLen = bits;
  }

  eval(input: bigint[], jointRand: bigint[], _shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const [poly] = this.gadgets;
    const field = this.field;
    const jointRandZero = jointRand[0];

    return field.sum(input, (value, index) =>
      field.mul(
        field.exp(jointRandZero, BigInt(index + 1)),
        poly.eval(field, [value]),
      ),
    );
  }

  encode(measurement: number | bigint): bigint[] {
    if (
      typeof measurement === "number" &&
      measurement !== Math.trunc(measurement)
    ) {
      throw new Error(
        `measurement ${measurement} was not an integer in [0, ${
          2 ** this.measurementLen
        })`,
      );
    }

    const bigintMeasurement = BigInt(measurement);

    if (
      bigintMeasurement < 0n ||
      bigintMeasurement >= BigInt(2 ** this.measurementLen)
    ) {
      throw new Error(
        `measurement ${bigintMeasurement} was not an integer in [0, ${
          2 ** this.measurementLen
        })`,
      );
    }

    return arr(
      this.measurementLen,
      (index) => (bigintMeasurement >> BigInt(index)) & 1n,
    );
  }

  truncate(input: bigint[]): bigint[] {
    const field = this.field;
    return [
      field.sum(input, (value, index) =>
        field.mul(field.exp(2n, BigInt(index)), value),
      ),
    ];
  }

  decode(output: bigint[], _measurementCount: number): bigint {
    return output[0];
  }
}
