import { assert } from "chai";
import { PrgSha3 } from ".";
import { Field128, Field64 } from "@divviup/field";
import PrgSha3TestVector from "./testVectors/PrgSha3.json" assert { type: "json" };

function assertBuffersEqual(x: Uint8Array, y: Uint8Array) {
  assert.equal(Buffer.from(x).toString("hex"), Buffer.from(y).toString("hex"));
}

describe("PrgSha3", () => {
  it("expanding", async () => {
    const field = new Field128();
    const expandedLen = 23;

    const dst = Buffer.from("dst", "ascii");
    const binder = Buffer.from("binder", "ascii");
    const seed = Buffer.alloc(PrgSha3.seedSize);
    const expanded = await new PrgSha3(seed, dst, binder).next(expandedLen);
    assert.equal(expanded.length, expandedLen);

    const expected = await new PrgSha3(seed, dst, binder).next(700);
    const prg = new PrgSha3(seed, dst, binder);

    const buffers = [];
    for (let i = 0; i < 100; i++) buffers.push(await prg.next(7));
    const actual = Buffer.concat(buffers);

    assertBuffersEqual(actual, expected);

    const derivedSeed = await PrgSha3.deriveSeed(seed, dst, binder);
    assert.equal(derivedSeed.length, PrgSha3.seedSize);

    const expandedVec = await PrgSha3.expandIntoVec(
      field,
      seed,
      dst,
      binder,
      expandedLen,
    );
    assert.equal(expandedVec.length, expandedLen);
  });

  it("cannot be built with the wrong seed length", () => {
    const dst = Buffer.from("dst", "ascii");
    const binder = Buffer.from("binder", "ascii");
    const { seedSize } = PrgSha3;
    assert.throws(() => new PrgSha3(Buffer.alloc(seedSize - 1), dst, binder));
    assert.throws(() => new PrgSha3(Buffer.alloc(seedSize + 1), dst, binder));
  });

  describe("PrgSha3 test vector", () => {
    const testVector = {
      ...PrgSha3TestVector,
      seed: Buffer.from(PrgSha3TestVector.seed, "hex"),
      dst: Buffer.from(PrgSha3TestVector.dst, "hex"),
      binder: Buffer.from(PrgSha3TestVector.binder, "hex"),
      length: PrgSha3TestVector.length,
      derived_seed: Buffer.from(PrgSha3TestVector.derived_seed, "hex"),
      expanded_vec_field128: Buffer.from(
        PrgSha3TestVector.expanded_vec_field128,
        "hex",
      ),
    };

    it("derives a seed correctly", async () => {
      const { seed, dst, binder, derived_seed: expected } = testVector;
      const actual = await PrgSha3.deriveSeed(seed, dst, binder);
      assert.deepEqual(actual, expected);
    });

    it("expands to the test vector with a single call to next", async () => {
      const { seed, dst, binder, expanded_vec_field128: expected } = testVector;
      const prg = new PrgSha3(seed, dst, binder);
      const actual = await prg.next(expected.length);
      assert.deepEqual(actual, expected);
    });

    it("expands to the test vector with repeated calls to next (retains state)", async () => {
      const { seed, dst, binder, expanded_vec_field128: expected } = testVector;
      const prg = new PrgSha3(seed, dst, binder);
      const actual = Buffer.alloc(expected.length);
      for (let i = 0; i < actual.length; i++) {
        const next = await prg.next(1);
        actual[i] = next[0];
      }
      assert.deepEqual(actual, expected);
    });
  });

  it("performs rejection sampling correctly", async () => {
    // These constants were found through brute-force search
    const field = new Field64();
    const expandedLen = 5;
    const seed = Buffer.from("231c400dcbafce345efd3ca77965ee06", "hex");
    const dst = Buffer.alloc(0);
    const binder = Buffer.alloc(0);
    const expectedLastElem = 13681157193520586550n;

    const expandedVec = await PrgSha3.expandIntoVec(
      field,
      seed,
      dst,
      binder,
      expandedLen,
    );
    assert.equal(expandedVec[expandedVec.length - 1], expectedLastElem);
  });
});
