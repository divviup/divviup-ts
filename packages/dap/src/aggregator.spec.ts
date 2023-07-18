import { Aggregator } from "./aggregator";
import assert from "assert";
import { Role } from "./constants";
import { HpkeConfig, HpkeConfigList } from "./hpkeConfig";
import { Aead, Kdf, Kem, Keypair } from "hpke";
import {
  InputShareAad,
  InputShareInfo,
  PlaintextInputShare,
  ReportMetadata,
} from "./report";
import { TaskId } from "./taskId";
import { ReportId } from "./reportId";

describe("DAP Aggregator", () => {
  it("should append a trailing slash on construction from a string", () => {
    const aggregator = new Aggregator(
      "http://example.com/aggregator",
      Role.Leader,
    );

    assert.equal(aggregator.url.toString(), "http://example.com/aggregator/");
  });

  it("should append a trailing slash on construction from a URL", () => {
    const aggregator = new Aggregator(
      new URL("http://example.com/aggregator"),
      Role.Leader,
    );

    assert.equal(aggregator.url.toString(), "http://example.com/aggregator/");
  });

  it("has a convenience method to build helper aggregator", () => {
    assert.deepEqual(
      Aggregator.helper("http://example.com"),
      new Aggregator("http://example.com", Role.Helper),
    );
  });

  it("has a convenience method to build leader aggregator", () => {
    assert.deepEqual(
      Aggregator.leader("http://example.com"),
      new Aggregator("http://example.com", Role.Leader),
    );
  });

  it("performs a hpke seal with the first valid hpke config", () => {
    const aggregator = Aggregator.leader("https://example.com");
    const kem = Kem.DhP256HkdfSha256;
    const { public_key, private_key } = new Keypair(kem);
    const hpkeConfig = new HpkeConfig(
      1,
      kem,
      Kdf.Sha256,
      Aead.AesGcm128,
      Buffer.from(public_key),
    );

    aggregator.hpkeConfigList = new HpkeConfigList([hpkeConfig]);
    const inputShare = new PlaintextInputShare([], Buffer.from("payload"));
    const aad = new InputShareAad(
      TaskId.random(),
      new ReportMetadata(ReportId.random(), Date.now() / 1000),
      Buffer.alloc(0),
    );
    const cipherText = aggregator.seal(inputShare, aad);

    const open = hpkeConfig
      .config()
      .base_mode_open(
        private_key,
        cipherText.encapsulatedContext,
        new InputShareInfo(Role.Leader).encode(),
        cipherText.payload,
        aad.encode(),
      );

    assert.deepEqual(Buffer.from(open), inputShare.encode());
  });

  it("throws when hpke seal is called without a hpke config list", () => {
    const aggregator = Aggregator.leader("https://example.com");
    const inputShare = new PlaintextInputShare([], Buffer.from("payload"));
    const aad = new InputShareAad(
      TaskId.random(),
      new ReportMetadata(ReportId.random(), Date.now() / 1000),
      Buffer.alloc(0),
    );

    assert.throws(() => aggregator.seal(inputShare, aad));
  });
});
