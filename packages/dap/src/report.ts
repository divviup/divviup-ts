import { Buffer } from "buffer";
import { TaskId } from "./taskId";
import {
  Encodable,
  encodeArray16,
  encodeArray32,
  encodeOpaque32,
} from "./encoding";
import { ReportId } from "./reportId";
import { Extension } from "./extension";
import { HpkeCiphertext } from "./ciphertext";

export class ReportMetadata implements Encodable {
  constructor(
    public reportID: ReportId,
    public time: number,
    public extensions: Extension[]
  ) {}

  encode(): Buffer {
    const encodedExtensions = encodeArray16(this.extensions);
    const buffer = Buffer.alloc(24 + encodedExtensions.length);
    this.reportID.encode().copy(buffer, 0);
    buffer.writeUInt32BE(this.time, 16 + 4);
    encodedExtensions.copy(buffer, 24);
    return buffer;
  }
}

export class Report implements Encodable {
  constructor(
    public taskID: TaskId,
    public metadata: ReportMetadata,
    public publicShare: Buffer,
    public encryptedInputShares: HpkeCiphertext[]
  ) {}

  encode(): Buffer {
    return Buffer.concat([
      this.taskID.encode(),
      this.metadata.encode(),
      encodeOpaque32(this.publicShare),
      encodeArray32(this.encryptedInputShares),
    ]);
  }
}
