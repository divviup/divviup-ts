import {
  InputShareAad,
  InputShareInfo,
  PlaintextInputShare,
  Report,
  ReportMetadata,
} from "./report.js";
import { TaskId } from "./taskId.js";
import { ReportId } from "./reportId.js";
import { HpkeCiphertext } from "./ciphertext.js";
import assert from "assert";
import { Role } from "./constants.js";

describe("DAP Report", () => {
  it("encodes as expected", () => {
    const reportId = ReportId.random();

    const leaderCiphertext = new HpkeCiphertext(
      1,
      Buffer.alloc(5, 1),
      Buffer.alloc(5, 1),
    );

    const helperCiphertext = new HpkeCiphertext(
      2,
      Buffer.alloc(2, 2),
      Buffer.alloc(2, 2),
    );

    const reportMetadata = new ReportMetadata(reportId, 0);
    const report = new Report(
      reportMetadata,
      Buffer.alloc(0),
      leaderCiphertext,
      helperCiphertext,
    );

    assert.deepEqual(
      report.encode(),
      Buffer.from([
        ...reportMetadata.encode(), // tested below
        ...[0, 0, 0, 0], // length of the (empty) public share
        ...leaderCiphertext.encode(), // tested in ciphertext.spec
        ...helperCiphertext.encode(),
      ]),
    );
  });
});

describe("DAP ReportMetadata", () => {
  it("encodes as expected", () => {
    const reportId = ReportId.random();
    const time = 1_000_000_000;
    const reportMetadata = new ReportMetadata(reportId, time);

    assert.deepEqual(
      reportMetadata.encode(),
      Buffer.from([
        ...reportId.encode(), // tested in reportId.spec
        ...[0, 0, 0, 0, 0x3b, 0x9a, 0xca, 0x00],
      ]),
    );
  });
});

describe("DAP PlaintextInputShare", () => {
  it("encodes as expected", () => {
    const payload = Buffer.from("payload");
    const plaintextInputShare = new PlaintextInputShare([], payload);
    assert.deepEqual(
      plaintextInputShare.encode(),
      Buffer.from([
        ...[0, 0], //array16 extensions
        ...[0, 0, 0, payload.length], // opaque32 payload length
        ...payload,
      ]),
    );
  });
});

describe("DAP InputShareAad", () => {
  it("encodes as expected", () => {
    const taskId = TaskId.random();
    const reportId = ReportId.random();
    const metadata = new ReportMetadata(reportId, 1);
    const publicShare = Buffer.from("public share");
    const aad = new InputShareAad(taskId, metadata, publicShare);
    assert.deepEqual(
      aad.encode(),
      Buffer.from([
        ...taskId.encode(),
        ...metadata.encode(),
        ...[0, 0, 0, publicShare.length], ///opaque32 public share
        ...publicShare,
      ]),
    );
  });
});

describe("DAP InputShareInfo", () => {
  it("encodes as expected", () => {
    assert.deepEqual(
      new InputShareInfo(Role.Helper).encode(),
      Buffer.from([...Buffer.from("dap-09 input share"), 1, 3]),
    );
    assert.deepEqual(
      new InputShareInfo(Role.Leader).encode(),
      Buffer.from([...Buffer.from("dap-09 input share"), 1, 2]),
    );
  });
});
