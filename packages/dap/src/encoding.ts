import { Buffer } from "buffer";
export interface Encodable {
  encode(): Buffer;
}

export function encodeArray16<T extends Encodable>(items: T[]): Buffer {
  const content = Buffer.concat([
    Buffer.alloc(2),
    ...items.map((item) => item.encode()),
  ]);
  content.writeUInt16BE(content.length - 2, 0);
  return content;
}

export function encodeArray32<T extends Encodable>(items: T[]): Buffer {
  const content = Buffer.concat([
    Buffer.alloc(4),
    ...items.map((item) => item.encode()),
  ]);
  content.writeUInt32BE(content.length - 4, 0);
  return content;
}

export function encodeOpaque16(buffer: Buffer): Buffer {
  const returnBuffer = Buffer.concat([Buffer.alloc(2), buffer]);
  returnBuffer.writeUInt16BE(buffer.length, 0);
  return returnBuffer;
}

export function encodeOpaque32(buffer: Buffer): Buffer {
  const returnBuffer = Buffer.concat([Buffer.alloc(4), buffer]);
  returnBuffer.writeUInt32BE(buffer.length, 0);
  return returnBuffer;
}

export type ParseSource = Parser | ArrayBuffer | Buffer;
interface Parseable<U> {
  parse(source: ParseSource): U;
}

export class Parser {
  index = 0;
  buffer: Buffer;

  static from(p: ParseSource): Parser {
    return p instanceof Parser ? p : new Parser(p);
  }

  constructor(buffer: Buffer | ArrayBuffer) {
    this.buffer = Buffer.from(buffer);
  }

  private increment<T>(bytes: number, fn: (this: Parser) => T): T {
    if (this.index + bytes > this.buffer.length) {
      throw new Error("attempted to read off end of buffer");
    }
    const ret = fn.call(this);
    this.index += bytes;
    return ret;
  }

  array16<T extends Parseable<U>, U>(Parseable: T): U[] {
    const length = this.uint16();
    const endIndex = this.index + length;
    const arr = [] as U[];

    while (this.index < endIndex) {
      arr.push(Parseable.parse(this));
    }

    if (this.index !== endIndex) {
      throw new Error(
        `expected to read exactly ${length} but read ${
          this.index - endIndex
        } over`
      );
    }

    return arr;
  }

  slice(bytes: number): Buffer {
    return this.increment(bytes, () =>
      Buffer.from(this.buffer.subarray(this.index, this.index + bytes))
    );
  }

  uint16(): number {
    return this.increment(2, () => this.buffer.readUInt16BE(this.index));
  }

  uint8(): number {
    return this.increment(1, () => this.buffer[this.index]);
  }

  opaque16(): Buffer {
    return this.slice(this.uint16());
  }
}
