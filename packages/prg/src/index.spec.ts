import assert from "assert";
import { PrgAes128 } from ".";
import { Field128, Field96 } from "@divviup/field";
import { randomBytes } from "@divviup/common";

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

  describe("test vector", () => {
    const testVector = {
      seed: Buffer.from("01010101010101010101010101010101", "hex"),
      info: Buffer.from("696e666f20737472696e67", "hex"),
      derived_seed: Buffer.from("ccf3be704c982182ad2961e9795a88aa", "hex"),
      expanded_vec: Buffer.from(
        "ccf3be704c982182ad2961e9795a88aa8df71c0b5ea5c13bcf3173c3f3626505e1bf4738874d5405805082cc38c55d1f04f85fbb88b8cf8592ffed8a4ac7f76991c58d850a15e8deb34fb289ab6fab584554ffef16c683228db2b76e792ca4f3c15760044d0703b438c2aefd7975c5dd4b9992ee6f87f20e570572dea18fa580ee17204903c1234f1332d47a442ea636580518ce7aa5943c415117460a049bc19cc81edbb0114d71890cbdbe4ea2664cd038e57b88fb7fd3557830ad363c20b9840d35fd6bee6c3c8424f026ee7fbca3daf3c396a4d6736d7bd3b65b2c228d22a40f4404e47c61b26ac3c88bebf2f268fa972f8831f18bee374a22af0f8bb94d9331a1584bdf8cf3e8a5318b546efee8acd28f6cba8b21b9d52acbae8e726500340da98d643d0a5f1270ecb94c574130cea61224b0bc6d438b2f4f74152e72b37e6a9541c9dc5515f8f98fd0d1bce8743f033ab3e8574180ffc3363f3a0490f6f9583bf73a87b9bb4b51bfd0ef260637a4288c37a491c6cbdc46b6a86cd26edf611793236e912e7227bfb85b560308b06238bbd978f72ed4a58583cf0c6e134066eb6b399ad2f26fa01d69a62d8a2d04b4b8acf82299b07a834d4c2f48fee23a24c20307f9cabcd34b6d69f1969588ebde777e46e9522e866e6dd1e14119a1cb4c0709fa9ea347d9f872e76a39313e7d49bfbf3e5ce807183f43271ba2b5c6aaeaef22da301327c1fd9fedde7c5a68d9b97fa6eb687ec8ca692cb0f631f46e6699a211a1254026c9a0a43eceb450dc97cfa923321baf1f4b6f233260d46182b844dccec153aaddd20f920e9e13ff11434bcd2aa632bf4f544f41b5ddced962939676476f70e0b8640c3471fc7af62d80053781295b070388f7b7f1fa66220cb3",
        "hex"
      ),
    };

    it("derives a seed correctly", async () => {
      const { seed, info, derived_seed: expected } = testVector;
      const actual = await PrgAes128.deriveSeed(seed, info);
      assert.deepEqual(actual, expected);
    });

    it("expands to the test vector with a single call to next", async () => {
      const { seed, info, expanded_vec: expected } = testVector;
      const prg = new PrgAes128(seed, info);
      const actual = await prg.next(expected.length);
      assert.deepEqual(actual, expected);
    });

    it("expands to the test vector with repeated calls to next (retains state)", async () => {
      const { seed, info, expanded_vec: expected } = testVector;
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
