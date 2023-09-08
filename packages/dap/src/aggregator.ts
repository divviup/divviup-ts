import { Role } from "./constants.js";
import {
  InputShareAad,
  InputShareInfo,
  PlaintextInputShare,
} from "./report.js";
import { HpkeCiphertext } from "./ciphertext.js";
import { HpkeConfigList } from "./hpkeConfig.js";

export class Aggregator {
  public url: URL;
  constructor(
    url: URL | string,
    public role: Role,
    public hpkeConfigList?: HpkeConfigList,
  ) {
    this.url = new URL(url);
    if (!this.url.pathname.endsWith("/")) {
      this.url.pathname += "/";
    }
  }

  static helper(url: string | URL): Aggregator {
    return new Aggregator(url, Role.Helper);
  }

  static leader(url: string | URL): Aggregator {
    return new Aggregator(url, Role.Leader);
  }

  async seal(
    inputShare: PlaintextInputShare,
    aad: InputShareAad,
  ): Promise<HpkeCiphertext> {
    if (!this.hpkeConfigList) {
      throw new Error(
        "Attempted to call Aggregator#seal before fetching a hpkeConfigList.",
      );
    }
    return await this.hpkeConfigList
      .selectConfig()
      .seal(
        new InputShareInfo(this.role).encode(),
        inputShare.encode(),
        aad.encode(),
      );
  }
}
