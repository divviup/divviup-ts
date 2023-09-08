import { Aggregator } from "./aggregator.js";
import assert from "assert";
import { Role } from "./constants.js";
import { HpkeConfig, HpkeConfigList } from "./hpkeConfig.js";
import {
  InputShareAad,
  InputShareInfo,
  PlaintextInputShare,
  ReportMetadata,
} from "./report.js";
import { TaskId } from "./taskId.js";
import { ReportId } from "./reportId.js";
import { KdfId, AeadId } from "hpke-js";
import { DhkemP256HkdfSha256 } from "@hpke/core";

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

  it("performs a hpke seal with the first valid hpke config", async () => {
    const aggregator = Aggregator.leader("https://example.com");
    const kem = new DhkemP256HkdfSha256();
    const { publicKey, privateKey } = await kem.generateKeyPair();
    const key = await kem.serializePublicKey(publicKey);

    const hpkeConfig = new HpkeConfig(
      1,
      kem.id,
      KdfId.HkdfSha256,
      AeadId.Aes128Gcm,
      Buffer.from(key),
    );

    aggregator.hpkeConfigList = new HpkeConfigList([hpkeConfig]);
    const inputShare = new PlaintextInputShare([], Buffer.from("payload"));
    const aad = new InputShareAad(
      TaskId.random(),
      new ReportMetadata(ReportId.random(), Date.now() / 1000),
      Buffer.alloc(0),
    );
    const cipherText = await aggregator.seal(inputShare, aad);

    const open = await hpkeConfig.cipherSuite().open(
      {
        recipientKey: privateKey,
        enc: cipherText.encapsulatedContext,
        info: new InputShareInfo(Role.Leader).encode(),
      },
      cipherText.payload,
      aad.encode(),
    );

    assert.deepEqual(
      Buffer.from(open).toString("hex"),
      inputShare.encode().toString("hex"),
    );
  });

  it("throws when hpke seal is called without a hpke config list", async () => {
    const aggregator = Aggregator.leader("https://example.com");
    const inputShare = new PlaintextInputShare([], Buffer.from("payload"));
    const aad = new InputShareAad(
      TaskId.random(),
      new ReportMetadata(ReportId.random(), Date.now() / 1000),
      Buffer.alloc(0),
    );

    await assert.rejects(aggregator.seal(inputShare, aad));
  });
});
