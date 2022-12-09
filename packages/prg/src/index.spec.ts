import assert from "assert";
import { PrgAes128 } from ".";
import { Field128, Field96 } from "@divviup/field";
import { randomBytes } from "@divviup/common";
import PrgAes128TestVector from "./testVectors/PrgAes128.json";

describe("PrgAes128", () => {
  it("expanding", async () => {
    const field = new Field128();
    const expandedLen = 23;

    const info = Buffer.from("info string", "ascii");
    const seed = randomBytes(PrgAes128.seedSize);
    const expanded = await new PrgAes128(seed, info).next(expandedLen);
    assert.equal(expanded.length, expandedLen);

    const expected = await new PrgAes128(seed, info).next(700);
    const prg = new PrgAes128(seed, info);

    const buffers = [];
    for (let i = 0; i < 100; i++) buffers.push(await prg.next(7));
    const actual = Buffer.concat(buffers);

    assert.equal(0, actual.compare(expected));
    assert.deepEqual(actual, expected);

    const derivedSeed = await PrgAes128.deriveSeed(seed, info);
    assert.equal(derivedSeed.length, PrgAes128.seedSize);

    const expandedVec = await PrgAes128.expandIntoVec(
      field,
      seed,
      info,
      expandedLen
    );
    assert.equal(expandedVec.length, expandedLen);
  });

  it("cannot be built with the wrong seed length", () => {
    const info = Buffer.from("info string", "ascii");
    const { seedSize } = PrgAes128;
    assert.throws(() => new PrgAes128(randomBytes(seedSize - 1), info));
    assert.throws(() => new PrgAes128(randomBytes(seedSize + 1), info));
  });

  describe("PrgAes128 test vector", () => {
    const testVector = {
      ...PrgAes128TestVector,
      seed: Buffer.from(PrgAes128TestVector.seed, "hex"),
      info: Buffer.from(PrgAes128TestVector.info, "hex"),
      derived_seed: Buffer.from(PrgAes128TestVector.derived_seed, "hex"),
      expanded_vec_field128: Buffer.from(
        PrgAes128TestVector.expanded_vec_field128,
        "hex"
      ),
    };

    it("derives a seed correctly", async () => {
      const { seed, info, derived_seed: expected } = testVector;
      const actual = await PrgAes128.deriveSeed(seed, info);
      assert.deepEqual(actual, expected);
    });

    it("expands to the test vector with a single call to next", async () => {
      const { seed, info, expanded_vec_field128: expected } = testVector;
      const prg = new PrgAes128(seed, info);
      const actual = await prg.next(expected.length);
      assert.deepEqual(actual, expected);
    });

    it("expands to the test vector with repeated calls to next (retains state)", async () => {
      const { seed, info, expanded_vec_field128: expected } = testVector;
      const prg = new PrgAes128(seed, info);
      const actual = Buffer.alloc(expected.length);
      for (let i = 0; i < actual.length; i++) {
        const next = await prg.next(1);
        actual[i] = next[0];
      }
      assert.equal(0, actual.compare(expected));
      assert.deepEqual(actual, expected);
    });
  });

  it("performs rejection sampling correctly", async () => {
    // These constants were found through brute-force search. Field96 is used because, out of the
    // three fields, it has the largest relative gap between the prime and the next power of two
    // by a few orders of magnitude, making these necessary preconditions easier to find.
    const field = new Field96();
    const expandedLen = 146;
    const seed = Buffer.from("0000000000000000000000000000015f", "hex");
    const info = Buffer.alloc(0);
    const expectedLastElem = 39729620190871453347343769187n;

    const expandedVec = await PrgAes128.expandIntoVec(
      field,
      seed,
      info,
      expandedLen
    );
    assert.equal(expandedVec[expandedLen - 1], expectedLastElem);
  });
});
