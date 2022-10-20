import { Encodable } from "./encoding";
import { randomBytes } from "@divviup/common";
import { Buffer } from "buffer";

export class ReportId implements Encodable {
  buffer: Buffer;

  constructor(input: Buffer) {
    this.buffer = input;

    if (this.buffer.length !== 16) {
      throw new Error("expected ReportId to be 16 bytes");
    }
  }

  static random(): ReportId {
    return new ReportId(Buffer.from(randomBytes(16)));
  }

  encode(): Buffer {
    return this.buffer;
  }
}
