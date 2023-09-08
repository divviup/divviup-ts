import { HpkeConfig, HpkeConfigList } from "./hpkeConfig.js";
import assert from "assert";
import { KemId, KdfId, AeadId } from "hpke-js";
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519";
import { DhkemP256HkdfSha256 } from "@hpke/core";

describe("DAP HpkeConfigList", () => {
  it("encodes as expected", () => {
    const config1 = new HpkeConfig(
      255,
      KemId.DhkemP256HkdfSha256,
      KdfId.HkdfSha256,
      AeadId.Aes128Gcm,
      Buffer.from("public key"),
    );
    const config2 = new HpkeConfig(
      255,
      KemId.DhkemX25519HkdfSha256,
      KdfId.HkdfSha384,
      AeadId.Chacha20Poly1305,
      Buffer.from("public key"),
    );
    const list = new HpkeConfigList([config1, config2]);
    assert.deepEqual(
      [...list.encode()],
      [0, 38, ...config1.encode(), ...config2.encode()],
    );
  });

  it("decodes as expected", () => {
    const config1 = new HpkeConfig(
      255,
      KemId.DhkemP256HkdfSha256,
      KdfId.HkdfSha256,
      AeadId.Aes128Gcm,
      Buffer.from("public key"),
    );
    const config2 = new HpkeConfig(
      255,
      KemId.DhkemX25519HkdfSha256,
      KdfId.HkdfSha384,
      AeadId.Chacha20Poly1305,
      Buffer.from("public key"),
    );

    const list = HpkeConfigList.parse(
      Buffer.from([0, 38, ...config1.encode(), ...config2.encode()]),
    );

    assert.deepEqual(list.configs, [config1, config2]);
  });

  it("selects the first config that it recognizes", () => {
    const validConfig = new HpkeConfig(
      255,
      KemId.DhkemP256HkdfSha256,
      KdfId.HkdfSha256,
      AeadId.Aes128Gcm,
      Buffer.from("public key"),
    );

    const invalidConfig = new HpkeConfig(
      100,
      KemId.DhkemX25519HkdfSha256,
      KdfId.HkdfSha512,
      AeadId.Chacha20Poly1305,
      Buffer.from("public key"),
    );

    // none of these are known ids, so we skip the invalid config
    invalidConfig.aeadId = 100;
    invalidConfig.kdfId = 100;
    invalidConfig.kemId = 100;

    const list = new HpkeConfigList([invalidConfig, validConfig]);

    assert.deepEqual(list.selectConfig(), validConfig);
  });
});

describe("DAP HpkeConfig", () => {
  it("encodes as expected", () => {
    const config = new HpkeConfig(
      255,
      KemId.DhkemP256HkdfSha256,
      KdfId.HkdfSha256,
      AeadId.Aes128Gcm,
      Buffer.from("public key"),
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
      ],
    );
  });

  it("decodes as expected", () => {
    const config = HpkeConfig.parse(
      Buffer.from([
        255, //id
        ...[0, 32],
        ...[0, 2],
        ...[0, 3],
        ...[0, 10], //length of "public key"
        ...Buffer.from("public key", "ascii"),
      ]),
    );

    assert.equal(config.publicKey.toString("ascii"), "public key");
    assert.equal(config.id, 255);
    assert.equal(config.kemId, 32);
    assert.equal(config.kdfId, 2);
    assert.equal(config.aeadId, 3);
  });

  it("throws useful errors when it cannot decode", () => {
    assert.throws(() => {
      HpkeConfig.parse(Buffer.alloc(5, 10)); // too short
    }, /attempted to read off end of buffer/);
  });

  it("cannot be built from an id greater than a u8", () => {
    assert.throws(() => {
      new HpkeConfig(300, 1, 1, 1, Buffer.alloc(10));
    }, /id must be an integer in \[0, 255\]/);
  });

  it("cannot be built from a decimal id", () => {
    assert.throws(() => {
      new HpkeConfig(10.1, 1, 1, 1, Buffer.alloc(10));
    }, /id must be an integer in \[0, 255\]/);
  });

  it("cannot be built from a negative id", () => {
    assert.throws(() => {
      new HpkeConfig(-10, 1, 1, 1, Buffer.alloc(10));
    }, /id must be an integer in \[0, 255\]/);
  });

  it("cannot be built from an unrecognized kemId", () => {
    assert.throws(() => {
      new HpkeConfig(10, 10, 1, 1, Buffer.alloc(10));
    }, /kemId was 10 but must be one of the following:/);
  });

  it("cannot be built from an unrecognized kdfId", () => {
    assert.throws(() => {
      new HpkeConfig(
        100,
        KemId.DhkemP256HkdfSha256,
        50,
        AeadId.Chacha20Poly1305,
        Buffer.alloc(10),
      );
    }, /kdfId was 50 but must be one of the following:/);
  });

  it("cannot be built from an unrecognized aeadId", () => {
    assert.throws(() => {
      new HpkeConfig(
        100,
        KemId.DhkemP256HkdfSha256,
        KdfId.HkdfSha512,
        5,
        Buffer.alloc(10),
      );
    }, /aeadId was 5 but must be one of the following:/);
  });

  describe("seal", () => {
    it("throws if the public key is a valid key for the wrong kem", async () => {
      const kem = new DhkemP256HkdfSha256();
      const { publicKey } = await kem.generateKeyPair();
      const key = await kem.serializePublicKey(publicKey);

      const config = new HpkeConfig(
        100,
        KemId.DhkemX25519HkdfSha256,
        KdfId.HkdfSha256,
        AeadId.Aes128Gcm,
        Buffer.from(key),
      );

      await assert.rejects(
        config.seal(
          Buffer.from("info"),
          Buffer.from("plaintext"),
          Buffer.from("aad"),
        ),
      );
    });

    it("throws if the public key is not a valid key at all", async () => {
      const config = new HpkeConfig(
        100,
        KemId.DhkemX25519HkdfSha256,
        KdfId.HkdfSha256,
        AeadId.Aes128Gcm,
        Buffer.from("not a valid key"),
      );

      await assert.rejects(
        config.seal(
          Buffer.from("info"),
          Buffer.from("plaintext"),
          Buffer.from("aad"),
        ),
      );
    });

    it("generates a valid X25519HkdfSha256 HpkeCiphertext if the ids are valid", async () => {
      const kem = new DhkemX25519HkdfSha256();
      const { publicKey, privateKey } = await kem.generateKeyPair();
      const key = await kem.serializePublicKey(publicKey);

      const config = new HpkeConfig(
        100,
        kem.id,
        KdfId.HkdfSha256,
        AeadId.Aes128Gcm,
        Buffer.from(key),
      );

      const cipherSuite = config.cipherSuite();

      const info = Buffer.from("info");
      const aad = Buffer.from("aad");
      const plaintext = Buffer.from("plaintext");
      const hpkeCipherText = await config.seal(info, plaintext, aad);

      const decrypted = await cipherSuite.open(
        {
          recipientKey: privateKey,
          info,
          enc: hpkeCipherText.encapsulatedContext,
        },
        hpkeCipherText.payload,
        aad,
      );

      assert.deepEqual(Buffer.from(decrypted), plaintext);
    });

    it("generates a valid DhP256HkdfSha256 HpkeCiphertext if the ids are valid", async () => {
      const kem = new DhkemP256HkdfSha256();
      const { publicKey, privateKey } = await kem.generateKeyPair();
      const key = await kem.serializePublicKey(publicKey);
      console.log(Buffer.from(key).toString("ascii"));

      const config = new HpkeConfig(
        100,
        kem.id,
        KdfId.HkdfSha256,
        AeadId.Aes128Gcm,
        Buffer.from(key),
      );

      const info = Buffer.from("info");
      const aad = Buffer.from("aad");
      const plaintext = Buffer.from("plaintext");
      const hpkeCipherText = await config.seal(info, plaintext, aad);

      const decrypted = await config.cipherSuite().open(
        {
          recipientKey: privateKey,
          enc: hpkeCipherText.encapsulatedContext,
          info,
        },
        hpkeCipherText.payload,
        aad,
      );

      assert.deepEqual(Buffer.from(decrypted), plaintext);
    });
  });
});
