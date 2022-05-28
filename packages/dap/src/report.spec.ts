import { Report } from "./report";
import { TaskId } from "./taskId";
import { Nonce } from "./nonce";
import { HpkeCiphertext } from "./ciphertext";
import assert from "assert";

describe("DAP Report", () => {
  it("encodes as expected", () => {
    const taskId = TaskId.random();
    const nonce = Nonce.generate(3600);

    const ciphertext1 = new HpkeCiphertext(
      1,
      Buffer.alloc(5, 1),
      Buffer.alloc(5, 1)
    );

    const ciphertext2 = new HpkeCiphertext(
      2,
      Buffer.alloc(2, 2),
      Buffer.alloc(2, 2)
    );

    const report = new Report(taskId, nonce, [], [ciphertext1, ciphertext2]);

    assert.deepEqual(
      report.encode(),
      Buffer.from([
        ...taskId.encode(), // tested in taskId.spec
        ...nonce.encode(), // tested in nonce.spec
        ...[0, 0], // there are no extensions
        ...[0, 15 + 9], // length of the combined ciphertext encodings
        ...ciphertext1.encode(), // tested in ciphertext.spec
        ...ciphertext2.encode(),
      ])
    );
  });
});
