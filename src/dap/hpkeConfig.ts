import * as hpke from "hpke";
import { Parser, Parseable, Encodable } from "dap/encoding";
import { HpkeCiphertext } from "dap/ciphertext";

export class HpkeConfig implements Encodable {
  constructor(
    public publicKey: Buffer,
    public id: number,
    public kemId: hpke.Kem,
    public kdfId: hpke.Kdf,
    public aeadId: hpke.Aead
  ) {}

  static parse(parsable: Parseable): HpkeConfig {
    const parser = Parser.from(parsable);
    return new HpkeConfig(
      parser.opaque16(),
      parser.uint8(),
      parser.uint16(),
      parser.uint16(),
      parser.uint16()
    );
  }

  encode(): Buffer {
    const len = this.publicKey.length;
    const buffer = Buffer.alloc(len + 9);
    buffer.writeUint16BE(len);
    this.publicKey.copy(buffer, 2);
    buffer.writeUint8(this.id, len + 2);
    buffer.writeUint16BE(this.kemId, len + 3);
    buffer.writeUint16BE(this.kdfId, len + 5);
    buffer.writeUint16BE(this.aeadId, len + 7);
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
