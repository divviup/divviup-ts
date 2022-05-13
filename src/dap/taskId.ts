import { randomBytes } from "common";
import { Encodable } from "dap/encoding";

export class TaskId implements Encodable {
  constructor(public buffer: Buffer) {
    if (buffer.length !== 32) {
      throw new Error("expected TaskId to be 32 bytes long");
    }
  }

  static random(): TaskId {
    return new TaskId(randomBytes(32));
  }

  encode(): Buffer {
    return this.buffer;
  }
}
