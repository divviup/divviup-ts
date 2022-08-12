import assert from "assert";
import { DAPClient, KnownVdafSpec, VdafMeasurement } from "dap/client";
import { HpkeConfig } from "dap/hpkeConfig";
import { RequestInit, RequestInfo, Response, Request } from "undici";
import * as hpke from "hpke";
import { TaskId } from "dap/taskId";
import { DAPError } from "./errors";
import { fill, zip } from "common";
import {
  Prio3Aes128Count,
  Prio3Aes128Histogram,
  Prio3Aes128Sum,
} from "prio3/instantiations";

interface Fetch {
  (input: RequestInfo, init?: RequestInit | undefined): Promise<Response>;
  calls: [RequestInfo, RequestInit | undefined][];
}

interface ResponseSpec {
  body?: Buffer | Uint8Array | number[] | string;
  contentType?: string;
  status?: number;
}

function mockFetch(mocks: { [url: string]: ResponseSpec[] }): Fetch {
  function fakeFetch(
    input: RequestInfo,
    init?: RequestInit | undefined
  ): Promise<Response> {
    fakeFetch.calls.push([input, init]);
    const responseSpec = mocks[input.toString()];
    const response = responseSpec.shift() || { status: 404 };
    return Promise.resolve(
      new Response(Buffer.from(response.body || ""), {
        status: response.status || 200,
        headers: { "Content-Type": response.contentType || "text/plain" },
      })
    );
  }

  fakeFetch.calls = [] as [RequestInfo, RequestInit | undefined][];
  return fakeFetch;
}

function buildHpkeConfig(): HpkeConfig {
  return new HpkeConfig(
    Math.floor(Math.random() * 255),
    hpke.Kem.DhP256HkdfSha256,
    hpke.Kdf.Sha256,
    hpke.Aead.AesGcm128,
    Buffer.from(new hpke.Keypair(hpke.Kem.DhP256HkdfSha256).public_key)
  );
}

function buildParams(): {
  type: "sum";
  bits: number;
  helper: string;
  leader: string;
  taskId: TaskId;
} {
  return {
    type: "sum",
    bits: 16,
    leader: "https://a.example.com",
    helper: "https://b.example.com",
    taskId: TaskId.random(),
  };
}

function withHpkeConfigs<
  Spec extends KnownVdafSpec,
  Measurement extends VdafMeasurement<Spec>
>(dapClient: DAPClient<Spec, Measurement>): DAPClient<Spec, Measurement> {
  for (const aggregator of dapClient.aggregators) {
    aggregator.hpkeConfig = buildHpkeConfig();
  }
  return dapClient;
}

describe("DAPClient", () => {
  describe("constructor variations", () => {
    it("accepts a string taskId that is the base64url encoding of a taskId", () => {
      const client = new DAPClient({
        ...buildParams(),
        taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
      });
      assert.equal(
        client.taskId.toString(),
        "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY"
      );
    });

    it("accepts a buffer taskId", () => {
      const client = new DAPClient({
        ...buildParams(),
        taskId: Buffer.from(
          "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
          "base64url"
        ),
      });

      assert.equal(
        client.taskId.toString(),
        "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY"
      );
    });

    it("can build a histogram vdaf", () => {
      const client = new DAPClient({
        type: "histogram",
        buckets: [10, 20, 30],
        helper: "http://helper",
        leader: "http://leader",
        taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
      });

      assert(client.vdaf instanceof Prio3Aes128Histogram);
    });

    it("can build a sum vdaf", () => {
      const client = new DAPClient({
        type: "sum",
        bits: 8,
        helper: "http://helper",
        leader: "http://leader",
        taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
      });

      assert(client.vdaf instanceof Prio3Aes128Sum);
    });

    it("can build a count vdaf", () => {
      const client = new DAPClient({
        type: "count",
        bits: 8,
        helper: "http://helper",
        leader: "http://leader",
        taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
      });

      assert(client.vdaf instanceof Prio3Aes128Count);
    });
  });

  describe("fetching key configuration", () => {
    it("can succeed", async () => {
      const params = buildParams();
      const [hpkeConfig1, hpkeConfig2] = [buildHpkeConfig(), buildHpkeConfig()];
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(hpkeConfig1),
        ],

        [`https://b.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(hpkeConfig2),
        ],
      });

      const client = new DAPClient(params);
      client.fetch = fetch;
      await client.fetchKeyConfiguration();
      assert.equal(fetch.calls.length, 2);
      assert.deepEqual(fetch.calls[1][1], {
        headers: { Accept: "application/dap-hpke-config" },
      });
      assert.deepEqual(client.aggregators[0].hpkeConfig, hpkeConfig1);
      assert.deepEqual(client.aggregators[1].hpkeConfig, hpkeConfig2);
    });

    it("throws an error if the status is not 200", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");

      const fetch = mockFetch({
        [`https://a.example.com/hpke_config?task_id=${taskId}`]: [
          { status: 418 },
        ],
        [`https://b.example.com/hpke_config?task_id=${taskId}`]: [
          { status: 500 },
        ],
      });

      const client = new DAPClient(params);
      client.fetch = fetch;

      await assert.rejects(client.fetchKeyConfiguration(), (error: Error) => {
        assert.match(error.message, /418/);
        return true;
      });

      assert.equal(fetch.calls.length, 2);
    });

    it("does not fetch key configuration if all of the aggregators already have key configs", async () => {
      const client = withHpkeConfigs(new DAPClient(buildParams()));
      const fetch = mockFetch({});
      client.fetch = fetch;
      await client.fetchKeyConfiguration();
      assert.equal(fetch.calls.length, 0);
    });

    it("throws an error if the content type is not correct", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/hpke_config?task_id=${taskId}`]: [
          {
            contentType: "application/text",
            body: buildHpkeConfig().encode(),
          },
        ],
        [`https://b.example.com/hpke_config?task_id=${taskId}`]: [
          {
            contentType: "application/text",
            body: buildHpkeConfig().encode(),
          },
        ],
      });
      const client = new DAPClient(params);
      client.fetch = fetch;
      await assert.rejects(client.fetchKeyConfiguration());
      assert.equal(fetch.calls.length, 2);
    });
  });
  describe("generating reports", () => {
    it("can succeed", async () => {
      const privateKeys = [] as [Buffer, number][];
      const client = new DAPClient({
        ...buildParams(),
        taskId: new TaskId(Buffer.alloc(32, 1)),
      });
      const kem = hpke.Kem.DhP256HkdfSha256;
      const kdf = hpke.Kdf.Sha256;
      const aead = hpke.Aead.AesGcm128;

      for (const aggregator of client.aggregators) {
        const { private_key, public_key } = new hpke.Keypair(kem);
        privateKeys.push([Buffer.from(private_key), aggregator.role]);
        aggregator.hpkeConfig = new HpkeConfig(
          Math.floor(Math.random() * 255),
          kem,
          kdf,
          aead,
          Buffer.from(public_key)
        );
      }

      const report = await client.generateReport(21);
      assert.equal(report.encryptedInputShares.length, 2);
      assert.equal(report.taskID, client.taskId);
      assert(
        Math.floor(Date.now() / 1000) - Number(report.nonce.time) <
          1 /*1 second delta*/
      );

      const aad = Buffer.from([
        ...fill(32, 1),
        ...report.nonce.encode(),
        ...[0, 0],
      ]);

      for (const [[privateKey, role], share] of zip(
        privateKeys,
        report.encryptedInputShares
      )) {
        const info = Buffer.from([
          ...Buffer.from("dap-01 input share"),
          1,
          role,
        ]);

        // at some point we might want to run the vdaf to completion
        // with these decrypted shares in order to assert that the
        // client does in fact generate valid input shares, but for
        // now we just assert that the hpke layer is as expected
        assert.doesNotThrow(() =>
          hpke.Config.try_from_ids(aead, kdf, kem).base_mode_open(
            privateKey,
            share.encapsulatedContext,
            info,
            share.payload,
            aad
          )
        );
      }
    });

    it("fails if the measurement is not valid", async () => {
      const client = withHpkeConfigs(new DAPClient(buildParams()));
      await assert.rejects(
        client.generateReport(-25.25),
        /measurement -25.25 was not an integer in \[0, 65536\)/ // this is specific to the Sum circuit as configured
      );
    });

    it("fails if there is an hpke error", async () => {
      const client = withHpkeConfigs(new DAPClient(buildParams()));
      assert(client.aggregators[0].hpkeConfig);
      client.aggregators[0].hpkeConfig.publicKey = Buffer.from(
        "not a valid public key"
      );
      await assert.rejects(client.generateReport(21));
    });

    it("fails if the HpkeConfig cannot be converted to a hpke.Config", async () => {
      const client = withHpkeConfigs(new DAPClient(buildParams()));
      assert(client.aggregators[0].hpkeConfig);
      client.aggregators[0].hpkeConfig.aeadId = 500.25;
      await assert.rejects(client.generateReport(21));
    });

    it("fetches hpke configs if needed", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(),
        ],
        [`https://b.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(),
        ],
      });
      const client = new DAPClient(params);
      client.fetch = fetch;
      await assert.doesNotReject(client.generateReport(10));
      assert.equal(fetch.calls.length, 2);
    });
  });

  describe("sending reports", () => {
    it("can succeed", async () => {
      const fetch = mockFetch({
        "https://a.example.com/upload": [{ status: 200 }],
      });
      const client = withHpkeConfigs(new DAPClient(buildParams()));
      client.fetch = fetch;
      const report = await client.generateReport(100);
      await client.sendReport(report);
      assert.equal(fetch.calls.length, 1);
      const [[url, args]] = fetch.calls;
      const request = new Request(url, args);
      assert.equal(request.url, "https://a.example.com/upload");
      assert(!!args);
      assert.deepEqual(args.body, report.encode());
      assert.equal(request.method, "POST");
      assert.equal(
        request.headers.get("Content-Type"),
        "application/dap-report"
      );
    });

    it("throws an error on failure", async () => {
      const fetch = mockFetch({});
      const client = withHpkeConfigs(new DAPClient(buildParams()));
      client.fetch = fetch;
      const report = await client.generateReport(100);
      await assert.rejects(client.sendReport(report));
      assert.equal(fetch.calls.length, 1);
    });
  });

  describe("sending measurement", () => {
    it("makes the correct number of http requests when all goes well", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(),
        ],
        [`https://b.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(),
        ],
        "https://a.example.com/upload": [{ status: 200 }],
      });

      const client = new DAPClient(params);
      client.fetch = fetch;
      await client.sendMeasurement(10);
      assert.equal(fetch.calls.length, 3);
    });

    it("retries once if the configs were outdated", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(),
          hpkeConfigResponse(),
        ],
        [`https://b.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(),
          hpkeConfigResponse(),
        ],
        "https://a.example.com/upload": [
          {
            status: 400,
            contentType: "application/problem+json",
            body: JSON.stringify({
              type: "urn:ietf:params:ppm:dap:outdatedConfig",
              title:
                "The message was generated using an outdated configuration.",
              status: 400,
              detail:
                "The message was generated using an outdated configuration.",
              instance: "..",
              taskid: params.taskId.toString(),
            }),
          },
          {},
        ],
      });

      const client = new DAPClient(params);
      client.fetch = fetch;
      await client.sendMeasurement(10);
      assert.equal(fetch.calls.length, 6);
    });

    it("does not retry more than once if the [refetched] configs were [still] outdated", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(),
          hpkeConfigResponse(),
        ],
        [`https://b.example.com/hpke_config?task_id=${taskId}`]: [
          hpkeConfigResponse(),
          hpkeConfigResponse(),
        ],
        "https://a.example.com/upload": [
          outdatedConfigResponse(params.taskId),
          outdatedConfigResponse(params.taskId),
        ],
      });

      const client = new DAPClient(params);
      client.fetch = fetch;
      await assert.rejects(
        client.sendMeasurement(10),
        (e) => e instanceof DAPError && e.shortType == "outdatedConfig"
      );
      assert.equal(fetch.calls.length, 6); // we do not try again
    });
  });
});

function outdatedConfigResponse(taskId: TaskId): ResponseSpec {
  return {
    status: 400,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: "urn:ietf:params:ppm:dap:outdatedConfig",
      title: "The message was generated using an outdated configuration.",
      status: 400,
      detail: "The message was generated using an outdated configuration.",
      instance: "..",
      taskid: taskId.toString(),
    }),
  };
}

function hpkeConfigResponse(config = buildHpkeConfig()): ResponseSpec {
  return {
    body: config.encode(),
    contentType: "application/dap-hpke-config",
  };
}
