import { Encodable } from "dap/encoding";
import { randomBytes } from "common";

export class Nonce implements Encodable {
  constructor(public time: bigint, public rand: Buffer) {
    if (rand.length !== 8) {
      throw new Error("rand must be 8 bytes");
    }
  }

  static generate(): Nonce {
    return new Nonce(BigInt(Math.round(Date.now() / 1000)), randomBytes(8));
  }

  encode(): Buffer {
    const buffer = Buffer.alloc(16);
    buffer.writeBigInt64BE(this.time, 0);
    this.rand.copy(buffer, 8, 0, 8);
    return buffer;
  }
}
