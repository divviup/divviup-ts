import { Buffer } from "buffer";
import { Encodable } from "./encoding";
import { randomBytes } from "@divviup/common";

export class Nonce implements Encodable {
  constructor(public time: number, public rand: Buffer) {
    if (rand.length !== 8) {
      throw new Error("rand must be 8 bytes");
    }
  }

  static generate(): Nonce {
    return new Nonce(
      Math.floor(Date.now() / 1000),
      Buffer.from(randomBytes(8))
    );
  }

  encode(): Buffer {
    const buffer = Buffer.alloc(16);
    buffer.writeUInt32BE(this.time, 4);
    this.rand.copy(buffer, 8, 0, 8);
    return buffer;
  }
}
