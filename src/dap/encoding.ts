export interface Encodable {
  encode(): Buffer;
}

export function encodeArray<T extends Encodable>(items: T[]): Buffer {
  const content = Buffer.concat([
    Buffer.alloc(2),
    ...items.map((item) => item.encode()),
  ]);
  content.writeUint16BE(content.length - 2, 0);
  return content;
}

export function encodeOpaque(buffer: Buffer): Buffer {
  const returnBuffer = Buffer.concat([Buffer.alloc(2), buffer]);
  returnBuffer.writeUint16BE(buffer.length, 0);
  return returnBuffer;
}

export type Parseable = Parser | ArrayBuffer | Buffer;

export class Parser {
  index = 0;
  buffer: Buffer;

  static from(p: Parseable): Parser {
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

  slice(bytes: number): Buffer {
    return this.increment(bytes, () =>
      this.buffer.slice(this.index, this.index + bytes)
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
