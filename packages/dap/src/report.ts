import { Buffer } from "buffer";
import { TaskId } from "./taskId.js";
import type { Encodable } from "./encoding.js";
import { encodeArray32, encodeArray16, encodeOpaque32 } from "./encoding.js";
import { ReportId } from "./reportId.js";
import { HpkeCiphertext } from "./ciphertext.js";
import { DAP_VERSION, Role } from "./constants.js";
import { Extension } from "./extension.js";

export class ReportMetadata implements Encodable {
  constructor(
    public reportId: ReportId,
    public time: number,
  ) {}

  encode(): Buffer {
    const buffer = Buffer.alloc(24);
    this.reportId.encode().copy(buffer, 0);
    buffer.writeUInt32BE(this.time, 16 + 4);
    return buffer;
  }
}

export class Report implements Encodable {
  constructor(
    public metadata: ReportMetadata,
    public publicShare: Buffer,
    public encryptedInputShares: HpkeCiphertext[],
  ) {}

  encode(): Buffer {
    return Buffer.concat([
      this.metadata.encode(),
      encodeOpaque32(this.publicShare),
      encodeArray32(this.encryptedInputShares),
    ]);
  }
}

export class PlaintextInputShare implements Encodable {
  constructor(
    public extensions: Extension[],
    public payload: Buffer,
  ) {}

  encode(): Buffer {
    return Buffer.concat([
      encodeArray16(this.extensions),
      encodeOpaque32(this.payload),
    ]);
  }
}

export class InputShareAad implements Encodable {
  constructor(
    public taskId: TaskId,
    public metadata: ReportMetadata,
    public publicShare: Buffer,
  ) {}

  encode(): Buffer {
    return Buffer.concat([
      this.taskId.encode(),
      this.metadata.encode(),
      encodeOpaque32(this.publicShare),
    ]);
  }
}

/** A Buffer that will always equal `${DAP_VERSION} input share` */
const INPUT_SHARE_ASCII = Buffer.from(`${DAP_VERSION} input share`, "ascii");

export class InputShareInfo implements Encodable {
  constructor(public serverRole: Role) {}
  encode(): Buffer {
    return Buffer.concat([
      INPUT_SHARE_ASCII,
      Buffer.from([1, this.serverRole]),
    ]);
  }
}
