import { Buffer } from "buffer";
import * as hpke from "hpke";
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
        config.config();
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
    public kemId: hpke.Kem,
    public kdfId: hpke.Kdf,
    public aeadId: hpke.Aead,
    public publicKey: Buffer
  ) {
    if (id !== Math.floor(id) || id < 0 || id > 255) {
      throw new Error("id must be an integer in [0, 255]");
    }

    this.validate(hpke.Kem, "kemId");
    this.validate(hpke.Kdf, "kdfId");
    this.validate(hpke.Aead, "aeadId");
  }

  private validate(
    e: { [key: string]: unknown },
    id: "kemId" | "kdfId" | "aeadId"
  ) {
    const actual = this[id];

    if (!(actual in e)) {
      const errorText = Object.keys(e)
        .map((n) => parseInt(n, 10))
        .filter((n) => !isNaN(n))
        .map((id) => `    ${id}: ${e[id] as string}`)
        .join("\n");

      throw new Error(
        `${id} was ${actual} but must be one of the following:\n${errorText}`
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
      parser.opaque16()
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
  config(): hpke.Config {
    return hpke.Config.try_from_ids(this.aeadId, this.kdfId, this.kemId);
  }

  seal(info: Buffer, plaintext: Buffer, aad: Buffer): HpkeCiphertext {
    const text = this.config().base_mode_seal(
      this.publicKey,
      info,
      plaintext,
      aad
    );

    return new HpkeCiphertext(
      this.id,
      Buffer.from(text.encapped_key),
      Buffer.from(text.ciphertext)
    );
  }
}
