import { Buffer } from "buffer";
import { TaskId } from "./taskId";
import {
  Encodable,
  encodeArray32,
  encodeArray16,
  encodeOpaque32,
} from "./encoding";
import { ReportId } from "./reportId";
import { HpkeCiphertext } from "./ciphertext";
import { DAP_VERSION, Role } from "./constants";
import { Extension } from "./extension";

export class ReportMetadata implements Encodable {
  constructor(
    public reportID: ReportId,
    public time: number,
  ) {}

  encode(): Buffer {
    const buffer = Buffer.alloc(24);
    this.reportID.encode().copy(buffer, 0);
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
