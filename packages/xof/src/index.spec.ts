import { assert } from "chai";
import { XofTurboShake128 } from "./index.js";
import { Field128, Field64 } from "@divviup/field";
import XofTurboShake128TestVector from "./testVectors/XofTurboShake128.json" with { type: "json" };

function assertBuffersEqual(x: Uint8Array, y: Uint8Array) {
  assert.equal(Buffer.from(x).toString("hex"), Buffer.from(y).toString("hex"));
}

describe("XofTurboShake128", () => {
  it("expanding", async () => {
    const field = new Field128();
    const expandedLen = 23;

    const dst = Buffer.from("dst", "ascii");
    const binder = Buffer.from("binder", "ascii");
    const seed = Buffer.alloc(XofTurboShake128.seedSize);
    const expanded = await new XofTurboShake128(seed, dst, binder).next(
      expandedLen,
    );
    assert.equal(expanded.length, expandedLen);

    const expected = await new XofTurboShake128(seed, dst, binder).next(700);
    const xof = new XofTurboShake128(seed, dst, binder);

    const buffers = [];
    for (let i = 0; i < 100; i++) buffers.push(await xof.next(7));
    const actual = Buffer.concat(buffers);

    assertBuffersEqual(actual, expected);

    const derivedSeed = await XofTurboShake128.deriveSeed(seed, dst, binder);
    assert.equal(derivedSeed.length, XofTurboShake128.seedSize);

    const expandedVec = await XofTurboShake128.expandIntoVec(
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
    const { seedSize } = XofTurboShake128;
    assert.throws(
      () => new XofTurboShake128(Buffer.alloc(seedSize - 1), dst, binder),
    );
    assert.throws(
      () => new XofTurboShake128(Buffer.alloc(seedSize + 1), dst, binder),
    );
  });

  it("cannot be built with too long a dst", () => {
    const dst = Buffer.alloc(256);
    const binder = Buffer.from("binder", "ascii");
    const seed = Buffer.alloc(XofTurboShake128.seedSize);
    assert.throws(() => new XofTurboShake128(seed, dst, binder));
  });

  describe("XofTurboShake128 test vector", () => {
    const testVector = {
      ...XofTurboShake128TestVector,
      seed: Buffer.from(XofTurboShake128TestVector.seed, "hex"),
      dst: Buffer.from(XofTurboShake128TestVector.dst, "hex"),
      binder: Buffer.from(XofTurboShake128TestVector.binder, "hex"),
      length: XofTurboShake128TestVector.length,
      derived_seed: Buffer.from(XofTurboShake128TestVector.derived_seed, "hex"),
      expanded_vec_field128: Buffer.from(
        XofTurboShake128TestVector.expanded_vec_field128,
        "hex",
      ),
    };

    it("derives a seed correctly", async () => {
      const { seed, dst, binder, derived_seed: expected } = testVector;
      const actual = await XofTurboShake128.deriveSeed(seed, dst, binder);
      assert.deepEqual(actual, expected);
    });

    it("expands to the test vector with a single call to next", async () => {
      const { seed, dst, binder, expanded_vec_field128: expected } = testVector;
      const xof = new XofTurboShake128(seed, dst, binder);
      const actual = await xof.next(expected.length);
      assert.deepEqual(actual, expected);
    });

    it("expands to the test vector with repeated calls to next (retains state)", async () => {
      const { seed, dst, binder, expanded_vec_field128: expected } = testVector;
      const xof = new XofTurboShake128(seed, dst, binder);
      const actual = Buffer.alloc(expected.length);
      for (let i = 0; i < actual.length; i++) {
        const next = await xof.next(1);
        actual[i] = next[0];
      }
      assert.deepEqual(actual, expected);
    });
  });

  it("performs rejection sampling correctly", async () => {
    // These constants were found through brute-force search
    const field = new Field64();
    const expandedLen = 140;
    const seed = Buffer.from([
      0xd1, 0x95, 0xec, 0x90, 0xc1, 0xbc, 0xf1, 0xf2, 0xcb, 0x2c, 0x7e, 0x74,
      0xc5, 0xc5, 0xf6, 0xda,
    ]);
    const dst = Buffer.alloc(0);
    const binder = Buffer.alloc(0);
    const expectedLastElem = 9734340616212735019n;

    const expandedVec = await XofTurboShake128.expandIntoVec(
      field,
      seed,
      dst,
      binder,
      expandedLen,
    );
    assert.equal(expandedVec[expandedVec.length - 1], expectedLastElem);
  });
});
