import { Encodable } from "dap/encoding";

enum ExtensionType {
  TBD,
}

export class Extension implements Encodable {
  constructor(public extensionType: ExtensionType, public data: Buffer) {}

  encode(): Buffer {
    throw new Error("tbd");
  }
}
