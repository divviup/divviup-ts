import { HpkeCiphertext } from "./ciphertext";
import assert from "assert";
describe("DAP HpkeCiphertext", () => {
  it("cannot be built from a negative configId", () => {
    assert.throws(() => {
      new HpkeCiphertext(-500, Buffer.alloc(10, 1), Buffer.alloc(10, 1));
    });
  });

  it("cannot be built from a configId greater than 255", () => {
    assert.throws(() => {
      new HpkeCiphertext(500, Buffer.alloc(10, 1), Buffer.alloc(10, 1));
    });
  });

  it("cannot be built from a decimal configId", () => {
    assert.throws(() => {
      new HpkeCiphertext(100.25, Buffer.alloc(10, 1), Buffer.alloc(10, 1));
    });
  });

  it("encodes correctly", () => {
    const ciphertext = new HpkeCiphertext(
      100,
      Buffer.alloc(5, 1),
      Buffer.alloc(10, 255)
    );
    assert.deepEqual(
      ciphertext.encode(),
      Buffer.from([
        100, // config id
        ...[0, 5], // encapsulated context length
        ...[1, 1, 1, 1, 1], // encapcapsulated context
        ...[0, 10], // payload length
        ...[255, 255, 255, 255, 255, 255, 255, 255, 255, 255], //payload
      ])
    );
  });
});
