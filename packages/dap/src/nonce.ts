import { Encodable } from "./encoding";
import { randomBytes } from "@divviup/common";
import { Buffer } from "buffer";

export class Nonce implements Encodable {
  constructor(public time: number, public rand: Uint8Array) {
    if (rand.length !== 16) {
      throw new Error("rand must be 16 bytes");
    }
  }

  static generate(minBatchDurationSeconds: number): Nonce {
    return new Nonce(
      Math.floor(Date.now() / 1000 / minBatchDurationSeconds) *
        minBatchDurationSeconds,
      randomBytes(16)
    );
  }

  encode(): Buffer {
    const buffer = Buffer.alloc(24);
    buffer.writeUInt32BE(this.time, 4);
    buffer.set(this.rand, 8);
    return buffer;
  }
}
