import { Role } from "./constants";
import { InputShareAad, InputShareInfo, PlaintextInputShare } from "./report";
import { HpkeCiphertext } from "./ciphertext";
import { HpkeConfigList } from "./hpkeConfig";

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

  seal(inputShare: PlaintextInputShare, aad: InputShareAad): HpkeCiphertext {
    if (!this.hpkeConfigList) {
      throw new Error(
        "Attempted to call Aggregator#seal before fetching a hpkeConfigList.",
      );
    }
    return this.hpkeConfigList
      .selectConfig()
      .seal(
        new InputShareInfo(this.role).encode(),
        inputShare.encode(),
        aad.encode(),
      );
  }
}
