import assert from "assert";
import { Buffer } from "buffer";
import { arr } from "@divviup/common";
import {
  Encodable,
  encodeArray16,
  encodeOpaque16,
  Parser,
  ParseSource,
} from "./encoding";

class Uint16 implements Encodable {
  constructor(public n: number) {}
  encode(): Buffer {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16BE(this.n, 0);
    return buffer;
  }

  static parse(source: ParseSource): Uint16 {
    return new Uint16(Parser.from(source).uint16());
  }
}

class TestEncodable implements Encodable {
  constructor(
    public array16: Uint16[],
    public opaque16: Buffer,
  ) {}
  encode(): Buffer {
    return Buffer.concat([
      encodeArray16(this.array16),
      encodeOpaque16(this.opaque16),
    ]);
  }

  static parse(source: ParseSource): TestEncodable {
    const parser = Parser.from(source);
    return new TestEncodable(parser.array16(Uint16), parser.opaque16());
  }
}

context("encoding", () => {
  context("encodeArray16", () => {
    it("correctly encodes a two byte length description and then the full array", () => {
      assert.deepEqual(
        encodeArray16([new Uint16(65535), new Uint16(255)]),
        Buffer.from([0, 4, 255, 255, 0, 255]),
      );
    });

    it("throws when the total length of the encoded array is longer than two bytes", () => {
      const array = arr(Math.floor(65535 / 2), (_) => new Uint16(0));
      assert.doesNotThrow(() => encodeArray16(array));

      array.push(new Uint16(0));
      assert.throws(() => encodeArray16(array));
    });
  });
});

context("decoding", () => {
  it("does not make a new parser if Parser.from is called with a Parser", () => {
    const parser = Parser.from(Buffer.from("hello"));
    parser.index = 5;
    assert.deepStrictEqual(Parser.from(parser), parser);
    assert.equal(Parser.from(parser).index, 5);
  });

  context("array16", () => {
    it("correctly decodes", () => {
      assert.deepEqual(
        Parser.from(Buffer.from([0, 4, 255, 255, 0, 255])).array16(Uint16),
        [new Uint16(65535), new Uint16(255)],
      );
    });

    it("throws if the content is too short", () => {
      const parser = Parser.from(Buffer.from([0, 4, 255, 255, 0]));
      assert.throws(() => parser.array16(Uint16));
    });

    it("throws if the Parseable type reads too far", () => {
      const parser = Parser.from(Buffer.from([0, 3, 255, 255, 0, 0]));
      assert.throws(
        () => parser.array16(Uint16),
        (e: Error) =>
          e.message === "expected to read exactly 3 but read 1 over",
      );
    });
  });
});

context("TestEncodable", () => {
  it("can round trip a single parseable encodable", () => {
    const testEncodable = new TestEncodable(
      [5, 10, 15, 20].map((n) => new Uint16(n)),
      Buffer.from("opaque"),
    );
    const encoded = testEncodable.encode();
    assert.deepEqual(TestEncodable.parse(encoded), testEncodable);
  });

  it("can round trip an array16 of parseable encodables", () => {
    const testEncodables = [
      new TestEncodable(
        [5, 10, 15, 20].map((n) => new Uint16(n)),
        Buffer.from("opaque"),
      ),
      new TestEncodable(
        [1, 2, 3].map((n) => new Uint16(n)),
        Buffer.from("also opaque"),
      ),
    ];
    const encoded = encodeArray16(testEncodables);
    assert.deepEqual(
      Parser.from(encoded).array16(TestEncodable),
      testEncodables,
    );
  });
});
