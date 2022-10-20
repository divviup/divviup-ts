import { Report, ReportMetadata } from "./report";
import { TaskId } from "./taskId";
import { ReportId } from "./reportId";
import { HpkeCiphertext } from "./ciphertext";
import assert from "assert";

describe("DAP Report", () => {
  it("encodes as expected", () => {
    const taskId = TaskId.random();
    const reportId = ReportId.random();

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

    const reportMetadata = new ReportMetadata(reportId, 0, []);
    const report = new Report(taskId, reportMetadata, Buffer.alloc(0), [
      ciphertext1,
      ciphertext2,
    ]);

    assert.deepEqual(
      report.encode(),
      Buffer.from([
        ...taskId.encode(), // tested in taskId.spec
        ...reportMetadata.encode(), // tested below
        ...[0, 0, 0, 0], // length of the (empty) public share
        ...[0, 0, 0, 17 + 11], // length of the combined ciphertext encodings
        ...ciphertext1.encode(), // tested in ciphertext.spec
        ...ciphertext2.encode(),
      ])
    );
  });
});

describe("DAP ReportMetadata", () => {
  it("encodes as expected", () => {
    const reportId = ReportId.random();
    const time = 1_000_000_000;
    const reportMetadata = new ReportMetadata(reportId, time, []);

    assert.deepEqual(
      reportMetadata.encode(),
      Buffer.from([
        ...reportId.encode(), // tested in reportId.spec
        ...[0, 0, 0, 0, 0x3b, 0x9a, 0xca, 0x00],
        ...[0, 0], // there are no extensions
      ])
    );
  });
});
