import { Buffer } from "buffer";
import { CipherSuite, KemId, KdfId, AeadId } from "hpke-js";
import { Parser, ParseSource, Encodable, encodeArray16 } from "./encoding";
import { HpkeCiphertext } from "./ciphertext";

export class HpkeConfigList implements Encodable {
  #selectedConfig?: HpkeConfig;
  constructor(public configs: HpkeConfig[]) {}

  static parse(parseable: ParseSource): HpkeConfigList {
    return new HpkeConfigList(Parser.from(parseable).array16(HpkeConfig));
  }

  encode(): Buffer {
    return encodeArray16(this.configs);
  }

  selectConfig(): HpkeConfig {
    if (this.#selectedConfig) return this.#selectedConfig;
    for (const config of this.configs) {
      try {
        config.cipherSuite();
        this.#selectedConfig = config;
        return config;
      } catch (_) {
        // skip over unrecognized configs
      }
    }

    throw new Error("no hpke configurations were recognized");
  }
}

export class HpkeConfig implements Encodable {
  constructor(
    public id: number,
    public kemId: number,
    public kdfId: number,
    public aeadId: number,
    public publicKey: Buffer,
  ) {
    if (id !== Math.floor(id) || id < 0 || id > 255) {
      throw new Error("id must be an integer in [0, 255]");
    }

    this.validate(KemId, "kemId");
    this.validate(KdfId, "kdfId");
    this.validate(AeadId, "aeadId");
  }

  private validate(
    e: { [key: string]: number },
    id: "kemId" | "kdfId" | "aeadId",
  ) {
    const actual = this[id];

    if (!Object.values(e).includes(actual)) {
      const errorText = Object.entries(e)
        .map(([name, identifier]) => `    ${identifier}: ${name}`)
        .join("\n");

      throw new Error(
        `${id} was ${actual} but must be one of the following:\n${errorText}`,
      );
    }
  }

  static parse(parsable: ParseSource): HpkeConfig {
    const parser = Parser.from(parsable);
    return new HpkeConfig(
      parser.uint8(),
      parser.uint16(),
      parser.uint16(),
      parser.uint16(),
      parser.opaque16(),
    );
  }

  encode(): Buffer {
    const len = this.publicKey.length;
    const buffer = Buffer.alloc(len + 9);
    let cursor = 0;
    buffer.writeUInt8(this.id, cursor);
    buffer.writeUInt16BE(this.kemId, (cursor += 1));
    buffer.writeUInt16BE(this.kdfId, (cursor += 2));
    buffer.writeUInt16BE(this.aeadId, (cursor += 2));
    buffer.writeUInt16BE(len, (cursor += 2));
    this.publicKey.copy(buffer, cursor + 2);
    return buffer;
  }

  /** @internal */
  cipherSuite(): CipherSuite {
    const aead: AeadId = this.aeadId as AeadId;
    const kdf: KdfId = this.kdfId as KdfId;
    const kem: KemId = this.kemId as KemId;
    return new CipherSuite({
      aead,
      kdf,
      kem,
    });
  }

  async seal(
    info: Buffer,
    plaintext: Buffer,
    aad: Buffer,
  ): Promise<HpkeCiphertext> {
    const cipherSuite = this.cipherSuite();
    const recipientPublicKey = await cipherSuite.kem.importKey(
      "raw",
      this.publicKey,
    );

    const { ct, enc } = await this.cipherSuite().seal(
      { recipientPublicKey, info },
      plaintext,
      aad,
    );

    return new HpkeCiphertext(this.id, Buffer.from(enc), Buffer.from(ct));
  }
}
