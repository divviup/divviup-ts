import { Gadget } from "prio3/gadget";
import { Vector, Field, Field128, Field64 } from "field";
import { Count } from "prio3/circuits/count";
import { Sum } from "prio3/circuits/sum";
import { Histogram } from "prio3/circuits/histogram";
import { FlpGeneric } from "prio3/genericFlp";
import { runFlp } from "prio3/flp.spec";
import { Circuit, GenericCircuit } from "prio3/circuit";
import { nextPowerOf2 } from "common";
import assert from "assert";
import { PolyEval } from "prio3/gadgets/polyEval";
import { Mul } from "prio3/gadgets/mul";

function testGadget(gadget: Gadget, field: Field, testLength: number) {
  const inputPoly = [];
  const input = [];
  const evalAt = field.randomElement();

  for (let i = 0; i < gadget.arity; i++) {
    const poly = field.fillRandom(testLength);
    inputPoly.push(poly);
    input.push(field.evalPoly(poly, evalAt));
  }

  const outPoly = gadget.evalPoly(field, inputPoly);
  const expected = gadget.eval(field, field.vec(input));
  const actual = field.evalPoly(outPoly, evalAt);

  assert.equal(actual, expected);
}

function testCircuitGadgets(circuit: GenericCircuit) {
  circuit.gadgets.forEach((gadget, index) => {
    const calls = circuit.gadgetCalls[index];
    testGadget(gadget, circuit.field, nextPowerOf2(calls + 1));
  });
}

function testCircuit<M>(circuit: Circuit<M>, input: Vector, expected: boolean) {
  assert.equal(input.length, circuit.inputLen);
  assert.equal(circuit.truncate(input).length, circuit.outputLen);
  const jointRand = circuit.field.fillRandom(circuit.jointRandLen);
  const v = circuit.eval(input, jointRand, 1);

  assert.equal(v == BigInt(0), expected);
  assert.equal(runFlp(new FlpGeneric(circuit), input, 1), expected);
}

class TestMultiGadget extends Circuit<number> {
  field = Field64;
  gadgets = [new Mul(), new Mul()];
  gadgetCalls = [1, 2];
  inputLen = 1;
  jointRandLen = 0;
  outputLen = 1;

  eval(input: Vector, jointRand: Vector, _shares: number): bigint {
    this.ensureValidEval(input, jointRand);
    const field = this.field;
    const [g0, g1] = this.gadgets;
    const x = g0.eval(field, field.vec([input.getValue(0), input.getValue(0)]));
    const y = g1.eval(field, field.vec([input.getValue(0), x]));
    const z = g1.eval(field, field.vec([x, y]));
    return z;
  }

  encode(measurement: number): Vector {
    if (![0, 1].includes(measurement)) {
      throw new Error("measurement expected to be 1 or 0");
    }
    return this.field.vec([BigInt(measurement)]);
  }

  truncate(input: Vector): Vector {
    if (input.length !== 1) {
      throw new Error("expected input length to be 1");
    }
    return input;
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
      testCircuit(count, count.field.vec([1337n]), false);
    });
  });

  describe("PolyEval(0, -23, 1, 3) gadget", () => {
    it("behaves as expected", () => {
      testGadget(new PolyEval([0n, -23n, 1n, 3n]), Field128, 10);
    });
  });

  describe("Sum", () => {
    const circuit = new Sum(10);
    it("gadgets", () => {
      testCircuitGadgets(circuit);
    });

    it("examples", () => {
      testCircuit(circuit, circuit.encode(0), true);
      testCircuit(circuit, circuit.encode(100), true);
      testCircuit(circuit, circuit.encode(2 ** 10 - 1), true);
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
