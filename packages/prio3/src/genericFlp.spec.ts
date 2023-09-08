import { Gadget } from "./gadget.js";
import { Field, Field128, Field64 } from "@divviup/field";
import { Count } from "./circuits/count.js";
import { Sum } from "./circuits/sum.js";
import { Histogram } from "./circuits/histogram.js";
import { FlpGeneric } from "./genericFlp.js";
import { runFlp } from "./flp.spec.js";
import { Circuit, GenericCircuit } from "./circuit.js";
import { arr, nextPowerOf2 } from "@divviup/common";
import assert from "assert";
import { PolyEval } from "./gadgets/polyEval.js";
import { Mul } from "./gadgets/mul.js";

function testGadget(gadget: Gadget, field: Field, testLength: number) {
  const evalAt = field.randomElement();
  const inputPoly = arr(gadget.arity, () => field.fillRandom(testLength));
  const input = inputPoly.map((poly) => field.evalPoly(poly, evalAt));
  const outPoly = gadget.evalPoly(field, inputPoly);
  const expected = gadget.eval(field, input);
  const actual = field.evalPoly(outPoly, evalAt);

  assert.equal(actual, expected);
}

function testCircuitGadgets(circuit: GenericCircuit) {
  circuit.gadgets.forEach((gadget, index) => {
    const calls = circuit.gadgetCalls[index];
    testGadget(gadget, circuit.field, nextPowerOf2(calls + 1));
  });
}

function testCircuit<M, AR>(
  circuit: Circuit<M, AR>,
  input: bigint[],
  expected: boolean,
) {
  assert.equal(input.length, circuit.inputLen);
  assert.equal(circuit.truncate(input).length, circuit.outputLen);
  const jointRand = circuit.field.fillRandom(circuit.jointRandLen);
  const v = circuit.eval(input, jointRand, 1);

  assert.equal(v == BigInt(0), expected);
  assert.equal(runFlp(new FlpGeneric(circuit), input, 1), expected);
}

class TestMultiGadget extends Circuit<number, number> {
  field = new Field64();
  gadgets = [new Mul(), new Mul()];
  gadgetCalls = [1, 2];
  inputLen = 1;
  jointRandLen = 0;
  outputLen = 1;

  eval(input: bigint[], jointRand: bigint[], _shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const field = this.field;
    const [g0, g1] = this.gadgets;
    const x = g0.eval(field, [input[0], input[0]]);
    const y = g1.eval(field, [input[0], x]);
    const z = g1.eval(field, [x, y]);
    return z;
  }

  encode(measurement: number): bigint[] {
    if (![0, 1].includes(measurement)) {
      throw new Error("measurement expected to be 1 or 0");
    }
    return [BigInt(measurement)];
  }

  truncate(input: bigint[]): bigint[] {
    if (input.length !== 1) {
      throw new Error("expected input length to be 1");
    }
    return input;
  }

  decode(output: bigint[], _measurementCount: number): number {
    return Number(output[0]);
  }
}

describe("flp generic", () => {
  describe("count", () => {
    const count = new Count();

    it("gadgets", () => {
      testCircuitGadgets(count);
    });

    it("examples", () => {
      testCircuit(count, count.encode(false), true);
      testCircuit(count, count.encode(true), true);
      testCircuit(count, [1337n], false);
    });
  });

  describe("PolyEval(0, -23, 1, 3) gadget", () => {
    it("behaves as expected", () => {
      testGadget(new PolyEval([0n, -23n, 1n, 3n]), new Field128(), 10);
    });
  });

  describe("Sum", () => {
    const circuit = new Sum(10);
    it("gadgets", () => {
      testCircuitGadgets(circuit);
    });

    it("examples", () => {
      testCircuit(circuit, circuit.encode(0n), true);
      testCircuit(circuit, circuit.encode(100n), true);
      testCircuit(circuit, circuit.encode(2n ** 10n - 1n), true);
      testCircuit(circuit, circuit.field.fillRandom(10), false);
    });
  });

  describe("Histogram", () => {
    const histogram = new Histogram([0, 10, 20]);
    it("gadgets", () => {
      testCircuitGadgets(histogram);
    });
    it("examples", () => {
      testCircuit(histogram, histogram.encode(0), true);
      testCircuit(histogram, histogram.encode(13), true);
      testCircuit(histogram, histogram.encode(2 ** 10 - 1), true);
      testCircuit(histogram, histogram.field.fillRandom(4), false);
    });
  });

  describe("TestMultiGadget", () => {
    const multiGadget = new TestMultiGadget();
    it("gadgets", () => {
      testCircuitGadgets(multiGadget);
    });

    it("examples", () => {
      testCircuit(multiGadget, multiGadget.encode(0), true);
    });
  });
});
