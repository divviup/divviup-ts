import assert from "assert";
import { inspect } from "node:util";
import { DivviupClient, sendMeasurement } from ".";
import { HpkeConfigList, HpkeConfig, TaskId } from "@divviup/dap";
import * as hpke from "hpke";

describe("DivviupClient", () => {
  it("fetches task from an id", async () => {
    const taskId = TaskId.random().toString();
    const client = new DivviupClient(taskId);
    const fetch = mockFetch({
      ...dapMocks(taskId),
      [`https://api.staging.divviup.org/tasks/${taskId}`]: [
        {
          status: 200,
          body: JSON.stringify(task(taskId)),
          contentType: "application/json",
        },
      ],
    });
    client.fetch = fetch;
    await client.sendMeasurement(10);
    assert.equal(fetch.calls.length, 4);
    assert.deepEqual(fetch.callStrings(), [
      `GET https://api.staging.divviup.org/tasks/${taskId}`,
      `GET https://a.example.com/v1/hpke_config?task_id=${taskId}`,
      `GET https://b.example.com/dap/hpke_config?task_id=${taskId}`,
      `PUT https://a.example.com/v1/tasks/${taskId}/reports`,
    ]);
  });

  it("fetches task from a task url", async () => {
    const taskId = TaskId.random().toString();
    const client = new DivviupClient(
      `https://production.divvi.up/v3/different-url/${taskId}.json`,
    );
    const fetch = mockFetch({
      ...dapMocks(taskId),
      [`https://production.divvi.up/v3/different-url/${taskId}.json`]: [
        {
          status: 200,
          body: JSON.stringify(task(taskId)),
          contentType: "application/json",
        },
      ],
    });
    client.fetch = fetch;
    await client.sendMeasurement(10);
    assert.equal(fetch.calls.length, 4);
    assert.deepEqual(fetch.callStrings(), [
      `GET https://production.divvi.up/v3/different-url/${taskId}.json`,
      `GET https://a.example.com/v1/hpke_config?task_id=${taskId}`,
      `GET https://b.example.com/dap/hpke_config?task_id=${taskId}`,
      `PUT https://a.example.com/v1/tasks/${taskId}/reports`,
    ]);
  });
});

describe("sendMeasurement", () => {
  it("fetches task from an id", async () => {
    const taskId = TaskId.random().toString();
    const fetch = mockFetch({
      ...dapMocks(taskId),
      [`https://api.staging.divviup.org/tasks/${taskId}`]: [
        {
          status: 200,
          body: JSON.stringify(task(taskId)),
          contentType: "application/json",
        },
      ],
    });

    await sendMeasurement(taskId, 10, fetch);

    assert.equal(fetch.calls.length, 4);
    assert.deepEqual(fetch.callStrings(), [
      `GET https://api.staging.divviup.org/tasks/${taskId}`,
      `GET https://a.example.com/v1/hpke_config?task_id=${taskId}`,
      `GET https://b.example.com/dap/hpke_config?task_id=${taskId}`,
      `PUT https://a.example.com/v1/tasks/${taskId}/reports`,
    ]);
  });
});

function dapMocks(taskId: string) {
  return {
    [`https://a.example.com/v1/hpke_config?task_id=${taskId}`]: [
      hpkeConfigResponse(),
    ],

    [`https://b.example.com/dap/hpke_config?task_id=${taskId}`]: [
      hpkeConfigResponse(),
    ],

    [`https://api.staging.divviup.org/tasks/${taskId}`]: [
      {
        status: 200,
        body: JSON.stringify(task(taskId)),
        contentType: "application/json",
      },
    ],
    [`https://a.example.com/v1/tasks/${taskId}/reports`]: [{ status: 201 }],
  };
}

interface Fetch {
  (input: RequestInfo, init?: RequestInit | undefined): Promise<Response>;
  calls: [RequestInfo, RequestInit | undefined][];
  callStrings(): string[];
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
    const responseSpec = mocks[input.toString()];
    const response = responseSpec?.shift();

    if (!response) {
      throw new Error(
        `received unhandled request.\n\nurl: ${input.toString()}.\n\nmocks: ${inspect(
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
  fakeFetch.callStrings = function () {
    return this.calls.map((x) => `${x[1]?.method || "GET"} ${x[0].toString()}`);
  };
  return fakeFetch;
}

function task(taskId: string): {
  vdaf: {
    type: "sum";
    bits: number;
  };
  helper: string;
  leader: string;
  id: string;
  time_precision_seconds: number;
} {
  return {
    vdaf: {
      type: "sum",
      bits: 16,
    },
    leader: "https://a.example.com/v1",
    helper: "https://b.example.com/dap/",
    id: taskId,
    time_precision_seconds: 1,
  };
}

function hpkeConfigResponse(config = buildHpkeConfigList()): ResponseSpec {
  return {
    body: config.encode(),
    contentType: "application/dap-hpke-config-list",
  };
}

function buildHpkeConfigList(): HpkeConfigList {
  return new HpkeConfigList([
    new HpkeConfig(
      Math.floor(Math.random() * 255),
      hpke.Kem.DhP256HkdfSha256,
      hpke.Kdf.Sha256,
      hpke.Aead.AesGcm128,
      Buffer.from(new hpke.Keypair(hpke.Kem.DhP256HkdfSha256).public_key),
    ),
  ]);
}
