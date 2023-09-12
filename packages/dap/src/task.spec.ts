import assert from "assert";
import type { KnownVdafSpec, VdafMeasurement } from "./task.js";
import { Task } from "./task.js";
import { HpkeConfig, HpkeConfigList } from "./hpkeConfig.js";
import { TaskId } from "./taskId.js";
import { DAPError } from "./errors.js";
import { zip } from "@divviup/common";
import { encodeOpaque32 } from "./encoding.js";
import { Prio3Count, Prio3Histogram, Prio3Sum } from "@divviup/prio3";
import { inspect } from "node:util";
import { KdfId, AeadId, CipherSuite } from "hpke-js";
import { DhkemP256HkdfSha256 } from "@hpke/core";

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
    init?: RequestInit | undefined,
  ): Promise<Response> {
    fakeFetch.calls.push([input, init]);

    let requestUrl;
    if (input instanceof Request) {
      requestUrl = input.url;
    } else {
      requestUrl = input; // string
    }

    const responseSpec = mocks[requestUrl];
    const response = responseSpec?.shift();

    if (!response) {
      throw new Error(
        `received unhandled request.\n\nurl: ${requestUrl}.\n\nmocks: ${inspect(
          mocks,
        ).slice(1, -1)}`,
      );
    }

    return Promise.resolve(
      new Response(Buffer.from(response.body || ""), {
        status: response.status || 200,
        headers: { "Content-Type": response.contentType || "text/plain" },
      }),
    );
  }

  fakeFetch.calls = [] as [RequestInfo, RequestInit | undefined][];
  return fakeFetch;
}

async function buildHpkeConfigList(): Promise<HpkeConfigList> {
  const kem = new DhkemP256HkdfSha256();
  const { publicKey } = await kem.generateKeyPair();
  const key = await kem.serializePublicKey(publicKey);

  return new HpkeConfigList([
    new HpkeConfig(
      Math.floor(Math.random() * 255),
      kem.id,
      KdfId.HkdfSha256,
      AeadId.Aes128Gcm,
      Buffer.from(key),
    ),
  ]);
}

function buildParams(): {
  type: "sum";
  bits: number;
  helper: string;
  leader: string;
  taskId: TaskId;
  timePrecisionSeconds: number;
} {
  return {
    type: "sum",
    bits: 16,
    leader: "https://a.example.com/v1",
    helper: "https://b.example.com/dap/",
    taskId: TaskId.random(),
    timePrecisionSeconds: 1,
  };
}

async function withHpkeConfigs<
  Spec extends KnownVdafSpec,
  Measurement extends VdafMeasurement<Spec>,
>(task: Task<Spec, Measurement>): Promise<Task<Spec, Measurement>> {
  for (const aggregator of task.aggregators) {
    aggregator.hpkeConfigList = await buildHpkeConfigList();
  }
  return task;
}

describe("Task", () => {
  describe("constructor variations", () => {
    it("accepts a string taskId that is the base64url encoding of a taskId", () => {
      const task = new Task({
        ...buildParams(),
        taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
      });
      assert.equal(
        task.taskId.toString(),
        "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
      );
    });

    it("accepts a buffer taskId", () => {
      const task = new Task({
        ...buildParams(),
        taskId: Buffer.from(
          "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
          "base64url",
        ),
      });

      assert.equal(
        task.taskId.toString(),
        "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
      );
    });

    it("can build a histogram vdaf", () => {
      const task = new Task({
        type: "histogram",
        buckets: [10, 20, 30],
        helper: "http://helper",
        leader: "http://leader",
        taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
        timePrecisionSeconds: 3600,
      });

      assert(task.vdaf instanceof Prio3Histogram);
    });

    it("can build a sum vdaf", () => {
      const task = new Task({
        type: "sum",
        bits: 8,
        helper: "http://helper",
        leader: "http://leader",
        taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
        timePrecisionSeconds: 3600,
      });

      assert(task.vdaf instanceof Prio3Sum);
    });

    it("can build a count vdaf", () => {
      const task = new Task({
        type: "count",
        bits: 8,
        helper: "http://helper",
        leader: "http://leader",
        taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
        timePrecisionSeconds: 3600,
      });

      assert(task.vdaf instanceof Prio3Count);
    });

    it("throws if the timePrecisionSeconds is not a number", () => {
      assert.throws(
        () =>
          new Task({
            ...buildParams(),
            timePrecisionSeconds: "ten" as unknown as number,
          }),
        (e: Error) => e.message == "timePrecisionSeconds must be a number",
      );
    });
  });

  describe("fetching key configuration", () => {
    it("can succeed", async () => {
      const params = buildParams();
      const [hpkeConfig1, hpkeConfig2] = [
        await buildHpkeConfigList(),
        await buildHpkeConfigList(),
      ];
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/v1/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(hpkeConfig1),
        ],

        [`https://b.example.com/dap/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(hpkeConfig2),
        ],
      });

      const task = new Task(params);
      task.fetch = fetch;
      await task.fetchKeyConfiguration();
      assert.equal(fetch.calls.length, 2);
      assert.deepEqual(fetch.calls[1][1], {
        headers: { Accept: "application/dap-hpke-config-list" },
      });
      assert.deepEqual(task.aggregators[0].hpkeConfigList, hpkeConfig1);
      assert.deepEqual(task.aggregators[1].hpkeConfigList, hpkeConfig2);
    });

    it("throws an error if the status is not 200", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");

      const fetch = mockFetch({
        [`https://a.example.com/v1/hpke_config?task_id=${taskId}`]: [
          { status: 418 },
        ],
        [`https://b.example.com/dap/hpke_config?task_id=${taskId}`]: [
          { status: 500 },
        ],
      });

      const task = new Task(params);
      task.fetch = fetch;

      await assert.rejects(task.fetchKeyConfiguration(), (error: Error) => {
        assert.match(error.message, /418/);
        return true;
      });

      assert.equal(fetch.calls.length, 2);
    });

    it("does not fetch key configuration if all of the aggregators already have key configs", async () => {
      const task = await withHpkeConfigs(new Task(buildParams()));
      const fetch = mockFetch({});
      task.fetch = fetch;
      await task.fetchKeyConfiguration();
      assert.equal(fetch.calls.length, 0);
    });

    it("throws an error if the content type is not correct", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/v1/hpke_config?task_id=${taskId}`]: [
          {
            contentType: "application/text",
            body: (await buildHpkeConfigList()).encode(),
          },
        ],
        [`https://b.example.com/dap/hpke_config?task_id=${taskId}`]: [
          {
            contentType: "application/text",
            body: (await buildHpkeConfigList()).encode(),
          },
        ],
      });
      const task = new Task(params);
      task.fetch = fetch;
      await assert.rejects(task.fetchKeyConfiguration());
      assert.equal(fetch.calls.length, 2);
    });
  });

  describe("generating reports", () => {
    it("can succeed", async () => {
      const privateKeys = [] as [CryptoKey, number][];
      const task = new Task({
        ...buildParams(),
        taskId: new TaskId(Buffer.alloc(32, 1)),
      });
      const kem = new DhkemP256HkdfSha256();
      const kdf = KdfId.HkdfSha256;
      const aead = AeadId.Aes128Gcm;

      for (const aggregator of task.aggregators) {
        const { publicKey, privateKey } = await kem.generateKeyPair();
        const key = await kem.serializePublicKey(publicKey);
        privateKeys.push([privateKey, aggregator.role]);
        aggregator.hpkeConfigList = new HpkeConfigList([
          new HpkeConfig(
            Math.floor(Math.random() * 255),
            kem.id,
            kdf,
            aead,
            Buffer.from(key),
          ),
        ]);
      }

      const report = await task.generateReport(21);
      assert.equal(report.encryptedInputShares.length, 2);
      assert(
        Math.floor(Date.now() / 1000) - Number(report.metadata.time) <
          2 /*2 second delta, double the minimum batch duration*/,
      );

      const aad = Buffer.concat([
        task.taskId.encode(),
        report.metadata.encode(),
        encodeOpaque32(report.publicShare),
      ]);

      for (const [[privateKey, role], share] of zip(
        privateKeys,
        report.encryptedInputShares,
      )) {
        const info = Buffer.from([
          ...Buffer.from("dap-04 input share"),
          1,
          role,
        ]);

        // at some point we might want to run the vdaf to completion
        // with these decrypted shares in order to assert that the
        // task does in fact generate valid input shares, but for
        // now we just assert that the hpke layer is as expected
        await assert.doesNotReject(
          new CipherSuite({ aead, kdf, kem }).open(
            { recipientKey: privateKey, enc: share.encapsulatedContext, info },
            share.payload,
            aad,
          ),
        );
      }
    });

    it("accepts an optional timestamp", async () => {
      const task = await withHpkeConfigs(new Task(buildParams()));
      const fetch = mockFetch({});
      task.fetch = fetch;
      const timestamp = new Date(0);
      const report = await task.generateReport(1, {
        timestamp,
      });
      assert.equal(report.metadata.time, timestamp.getTime());
    });

    it("fails if the measurement is not valid", async () => {
      const task = await withHpkeConfigs(new Task(buildParams()));
      await assert.rejects(
        task.generateReport(-25.25),
        /measurement -25.25 was not an integer/, // this is specific to the Sum circuit as configured
      );
    });

    it("fails if there is an hpke error", async () => {
      const task = await withHpkeConfigs(new Task(buildParams()));
      assert(task.aggregators[0].hpkeConfigList);
      task.aggregators[0].hpkeConfigList.configs[0].publicKey = Buffer.from(
        "not a valid public key",
      );
      await assert.rejects(task.generateReport(21));
    });

    it("fails if the HpkeConfig cannot be converted to a hpke.Config", async () => {
      const task = await withHpkeConfigs(new Task(buildParams()));
      assert(task.aggregators[0].hpkeConfigList);
      task.aggregators[0].hpkeConfigList.configs[0].aeadId = 500.25;
      await assert.rejects(task.generateReport(21));
    });

    it("fetches hpke configs if needed", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/v1/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(),
        ],
        [`https://b.example.com/dap/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(),
        ],
      });
      const task = new Task(params);
      task.fetch = fetch;
      await assert.doesNotReject(task.generateReport(10));
      assert.equal(fetch.calls.length, 2);
    });
  });

  describe("sending reports", () => {
    it("can succeed", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/v1/tasks/${taskId}/reports`]: [{ status: 201 }],
      });
      const task = await withHpkeConfigs(new Task(params));
      task.fetch = fetch;
      const report = await task.generateReport(100);
      await task.sendReport(report);
      assert.equal(fetch.calls.length, 1);
      const [[url, args]] = fetch.calls;
      const request = new Request(url, args);
      assert.equal(
        request.url,
        `https://a.example.com/v1/tasks/${taskId}/reports`,
      );
      assert(!!args);
      assert.deepEqual(args.body, report.encode());
      assert.equal(request.method, "PUT");
      assert.equal(
        request.headers.get("Content-Type"),
        "application/dap-report",
      );
    });

    it("throws an error on failure", async () => {
      const fetch = mockFetch({});
      const task = await withHpkeConfigs(new Task(buildParams()));
      task.fetch = fetch;
      const report = await task.generateReport(100);
      await assert.rejects(task.sendReport(report));
      assert.equal(fetch.calls.length, 1);
    });
  });

  describe("sending measurement", () => {
    it("makes the correct number of http requests when all goes well", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/v1/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(),
        ],
        [`https://b.example.com/dap/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(),
        ],
        [`https://a.example.com/v1/tasks/${taskId}/reports`]: [{ status: 201 }],
      });

      const task = new Task(params);
      task.fetch = fetch;
      await task.sendMeasurement(10);
      assert.equal(fetch.calls.length, 3);
    });

    it("retries once if the configs were outdated", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/v1/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(),
          await hpkeConfigResponse(),
        ],
        [`https://b.example.com/dap/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(),
          await hpkeConfigResponse(),
        ],
        [`https://a.example.com/v1/tasks/${taskId}/reports`]: [
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

      const task = new Task(params);
      task.fetch = fetch;
      await task.sendMeasurement(10);
      assert.equal(fetch.calls.length, 6);
    });

    it("does not retry more than once if the [refetched] configs were [still] outdated", async () => {
      const params = buildParams();
      const taskId = params.taskId.buffer.toString("base64url");
      const fetch = mockFetch({
        [`https://a.example.com/v1/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(),
          await hpkeConfigResponse(),
        ],
        [`https://b.example.com/dap/hpke_config?task_id=${taskId}`]: [
          await hpkeConfigResponse(),
          await hpkeConfigResponse(),
        ],
        [`https://a.example.com/v1/tasks/${taskId}/reports`]: [
          outdatedConfigResponse(params.taskId),
          outdatedConfigResponse(params.taskId),
        ],
      });

      const task = new Task(params);
      task.fetch = fetch;
      await assert.rejects(
        task.sendMeasurement(10),
        (e) => e instanceof DAPError && e.shortType == "outdatedConfig",
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

async function hpkeConfigResponse(
  config?: HpkeConfigList,
): Promise<ResponseSpec> {
  return {
    body: (config || (await buildHpkeConfigList())).encode(),
    contentType: "application/dap-hpke-config-list",
  };
}
