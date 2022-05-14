import * as hpke from "hpke";
import { Parser, Parseable, Encodable } from "dap/encoding";
import { HpkeCiphertext } from "dap/ciphertext";

export class HpkeConfig implements Encodable {
  constructor(
    public id: number,
    public kemId: hpke.Kem,
    public kdfId: hpke.Kdf,
    public aeadId: hpke.Aead,
    public publicKey: Buffer
  ) {}

  static parse(parsable: Parseable): HpkeConfig {
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
    buffer.writeUint8(this.id, cursor);
    buffer.writeUint16BE(this.kemId, (cursor += 1));
    buffer.writeUint16BE(this.kdfId, (cursor += 2));
    buffer.writeUint16BE(this.aeadId, (cursor += 2));
    buffer.writeUint16BE(len, (cursor += 2));
    this.publicKey.copy(buffer, cursor + 2);
    return buffer;
  }

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
