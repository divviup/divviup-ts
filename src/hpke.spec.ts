import assert from "assert";
import { Keypair, Aead, Kdf, Kem, Config } from "hpke";
import { TextEncoder, TextDecoder } from "util";

describe("HPKE", () => {
  describe("Config", () => {
    it("throws when the algorithms specified are invalid", () => {
      const [aead, kdf, kem] = [100, 100, 100];

      assert(!(aead in Aead));
      assert(!(kdf in Kdf));
      assert(!(kem in Kem));

      assert.throws(() => Config.try_from_ids(aead, kdf, kem));
    });
  });

  describe("Keypair", () => {
    it("generates a (65, 32)-byte keypair for Kem.DhP256HkdfSha256", () => {
      const keypair = new Keypair(Kem.DhP256HkdfSha256);
      assert.equal(keypair.public_key.length, 65);
      assert.equal(keypair.private_key.length, 32);
    });

    it("generates a (32, 32)-byte keypair for Kem.X25519HkdfSha256", () => {
      const keypair = new Keypair(Kem.X25519HkdfSha256);
      assert.equal(keypair.public_key.length, 32);
      assert.equal(keypair.private_key.length, 32);
    });

    it("throws when provided an invalid Kem", () => {
      assert.throws(() => new Keypair(1000));
    });
  });

  describe("Round trips", () => {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const startMessage = "plaintext message text";
    const plaintext = encoder.encode(startMessage);
    const info = encoder.encode("app info");
    const aad = encoder.encode("associated data");

    for (const aead of [
      Aead.AesGcm128,
      Aead.AesGcm256,
      Aead.ChaCha20Poly1305,
    ]) {
      for (const kdf of [Kdf.Sha256, Kdf.Sha384, Kdf.Sha512]) {
        for (const kem of [Kem.DhP256HkdfSha256, Kem.X25519HkdfSha256]) {
          it(`succeeds for ${Aead[aead]}, ${Kdf[kdf]}, ${Kem[kem]}`, () => {
            const config = Config.try_from_ids(aead, kdf, kem);

            assert.equal(config.aead, aead);
            assert.equal(config.kem, kem);
            assert.equal(config.kdf, kdf);

            const keypair = new Keypair(config.kem);

            const keyAndCiphertext = config.base_mode_seal(
              keypair.public_key,
              info,
              plaintext,
              aad
            );

            const roundTrip = config.base_mode_open(
              keypair.private_key,
              keyAndCiphertext.encapped_key,
              info,
              keyAndCiphertext.ciphertext,
              aad
            );

            assert.equal(startMessage, decoder.decode(roundTrip));
          });
        }
      }
    }
  });
});
