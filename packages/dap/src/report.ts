import { Buffer } from "buffer";
import { TaskId } from "./taskId";
import { Encodable, encodeArray16 } from "./encoding";
import { Nonce } from "./nonce";
import { Extension } from "./extension";
import { HpkeCiphertext } from "./ciphertext";

export class Report implements Encodable {
  constructor(
    public taskID: TaskId,
    public nonce: Nonce,
    public extensions: Extension[],
    public encryptedInputShares: HpkeCiphertext[]
  ) {}

  encode(): Buffer {
    return Buffer.concat([
      this.taskID.encode(),
      this.nonce.encode(),
      encodeArray16(this.extensions),
      encodeArray16(this.encryptedInputShares),
    ]);
  }
}
