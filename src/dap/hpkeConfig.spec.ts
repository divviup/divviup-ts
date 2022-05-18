import { HpkeConfig } from "dap/hpkeConfig";
import assert from "assert";
import * as hpke from "hpke";

describe("DAP HpkeConfig", () => {
  describe("HpkeConfig", () => {
    it("encodes as expected", () => {
      const config = new HpkeConfig(
        255,
        hpke.Kem.DhP256HkdfSha256,
        hpke.Kdf.Sha256,
        hpke.Aead.AesGcm128,
        Buffer.from("public key")
      );

      assert.deepEqual(
        [...config.encode()],
        [
          255, //id
          ...[0, 16],
          ...[0, 1],
          ...[0, 1],
          ...[0, 10], //length of "public key"
          ...Buffer.from("public key", "ascii"),
        ]
      );
    });

    it("decodes as expected", () => {
      const config = HpkeConfig.parse(
        Buffer.from([
          255, //id
          ...[0, 1],
          ...[0, 2],
          ...[0, 3],
          ...[0, 10], //length of "public key"
          ...Buffer.from("public key", "ascii"),
        ])
      );

      assert.equal(config.publicKey.toString("ascii"), "public key");
      assert.equal(config.id, 255);
      assert.equal(config.kemId, 1);
      assert.equal(config.kdfId, 2);
      assert.equal(config.aeadId, 3);
    });

    it("throws useful errors when it cannot decode");
    it("throws useful errors when it cannot decode");
    it("cannot be built from an id greater than a u8");
  });

  describe("config", () => {
    it("generates a hpke.Config when the ids are valid");
    it("throws when the ids are not valid");
  });

  describe("seal", () => {
    it("throws if the ids are not valid");
    it("generates a valid HpkeCiphertext if the ids are valid");
  });
});
