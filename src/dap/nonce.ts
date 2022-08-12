import { Encodable } from "dap/encoding";
import { randomBytes } from "common";

export class Nonce implements Encodable {
  constructor(public time: bigint, public rand: Buffer) {
    // TODO: round time down to batch size
    if (rand.length !== 16) {
      throw new Error("rand must be 16 bytes");
    }
  }

  static generate(): Nonce {
    return new Nonce(BigInt(Math.floor(Date.now() / 1000)), randomBytes(16));
  }

  encode(): Buffer {
    const buffer = Buffer.alloc(24);
    buffer.writeBigInt64BE(this.time, 0);
    this.rand.copy(buffer, 8, 0, 16);
    return buffer;
  }
}
