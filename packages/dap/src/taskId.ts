import { Buffer } from "buffer";
import { randomBytes } from "@divviup/common";
import { Encodable } from "./encoding.js";

export class TaskId implements Encodable {
  buffer: Buffer;

  constructor(input: Buffer | string) {
    if (typeof input === "string") {
      this.buffer = Buffer.from(
        input.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      );
    } else {
      this.buffer = input;
    }

    if (this.buffer.length !== 32) {
      throw new Error(
        `expected TaskId to be 32 bytes long (${this.toString()})`,
      );
    }
  }

  static random(): TaskId {
    return new TaskId(Buffer.from(randomBytes(32)));
  }

  toString(): string {
    return this.buffer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  encode(): Buffer {
    return this.buffer;
  }
}
