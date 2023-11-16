import { app } from "./index.js";
import { arr, randomBytes } from "@divviup/common";
import type { AddressInfo } from "node:net";
import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { Server } from "node:http";

const JANUS_INTEROP_AGGREGATOR_IMAGE =
  "us-west2-docker.pkg.dev/divviup-artifacts-public/janus/janus_interop_aggregator@sha256:8cc873f7a8be459fe2dbecdf78561806b514ac98b4d644dc9a7f6bb25bb9df02";

const JANUS_INTEROP_COLLECTOR_IMAGE =
  "us-west2-docker.pkg.dev/divviup-artifacts-public/janus/janus_interop_collector@sha256:982110bc29842639355830339b95fac77432cbbcc28df0cd07daf91551570602";

const IDENTIFIER_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSuffix(): string {
  return arr(
    10,
    (_) =>
      IDENTIFIER_ALPHABET[
        Math.floor(Math.random() * IDENTIFIER_ALPHABET.length)
      ],
  ).join("");
}

function spawnSyncAndThrow(
  command: string,
  args: Array<string>,
): SpawnSyncReturns<string> {
  const result = spawnSync(command, args, { encoding: "utf-8" });
  if (result.error) {
    throw result.error;
  } else if (result.status !== null && result.status !== 0) {
    throw new Error(
      `${command} failed with status code ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  } else if (result.signal !== null) {
    throw new Error(`${command} was killed with signal ${result.signal}`);
  }
  return result;
}

class Network {
  name: string;

  constructor(name: string) {
    this.name = name;
    spawnSyncAndThrow("docker", ["network", "create", "--driver=bridge", name]);
  }

  tryDisconnect(containerName: string) {
    // Ignore error status codes, which are expected in the case where no container with this name
    // exists.
    spawnSync("docker", ["network", "disconnect", this.name, containerName]);
  }

  delete() {
    spawnSyncAndThrow("docker", ["network", "rm", this.name]);
  }
}

class Container {
  port: number;
  name: string;

  constructor(image: string, name: string, network: Network) {
    this.name = name;
    spawnSyncAndThrow("docker", [
      "run",
      "--detach",
      `--name=${name}`,
      `--network=${network.name}`,
      `--publish=8080`,
      image,
    ]);
    const result = spawnSyncAndThrow("docker", ["port", name, "8080"]);
    const match = /^0.0.0.0:([0-9]+)$/m.exec(result.stdout);
    if (!match) {
      throw new Error(
        `docker port output could not be parsed, was ${result.stdout}`,
      );
    }
    this.port = parseInt(match[1], 10);
  }

  delete() {
    spawnSync("docker", ["rm", "--force", this.name]);
  }

  async waitForReady() {
    await waitForReady(this.port);
  }

  /** Send an interoperation test API request, and return the response. */
  async sendRequest(
    apiEndpoint: string,
    requestBody: object,
  ): Promise<object & Record<"status", unknown>> {
    const response = await fetch(
      `http://127.0.0.1:${this.port}/internal/test/${apiEndpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );
    return await checkResponseError(response);
  }
}

/** Check the status field in a response, throw an error if it wasn't successful, and return the
 * response body otherwise. */
async function checkResponseError(
  response: Response,
): Promise<object & Record<"status", unknown>> {
  if (response.status !== 200) {
    const body = await response.text();
    throw new Error(
      `Test API returned status code ${response.status}, body: ${body}`,
    );
  }
  const rawBody: unknown = await response.json();

  if (
    typeof rawBody !== "object" ||
    Array.isArray(rawBody) ||
    rawBody === null
  ) {
    throw new Error("Response JSON body is not an object");
  }

  if (!("status" in rawBody)) {
    throw new Error("`status` is missing");
  }
  if (
    rawBody.status !== "success" &&
    rawBody.status !== "complete" &&
    rawBody.status !== "in progress"
  ) {
    const body = rawBody as {
      status: unknown;
      error?: unknown;
    };
    throw new Error(`Request failed: ${JSON.stringify(body)}`);
  }
  return rawBody;
}

class Aggregator extends Container {
  async endpointForTask(id: EncodedBlob, role: string): Promise<URL> {
    const rawBody = await this.sendRequest("endpoint_for_task", {
      task_id: id.toString(),
      role: role,
      hostname: this.name,
    });

    if (!("endpoint" in rawBody)) {
      throw new Error(`\`endpoint\` is missing: ${JSON.stringify(rawBody)}`);
    }

    const body = rawBody as { endpoint: unknown };
    if (typeof body.endpoint !== "string") {
      throw new Error("`endpoint` is not a string");
    }
    return new URL(body.endpoint, `http://${this.name}:8080/`);
  }

  /** Send an /internal/test/add_task request. */
  async addTask(
    id: EncodedBlob,
    role: string,
    leaderEndpoint: URL,
    helperEndpoint: URL,
    vdaf: object,
    aggregatorAuthToken: string,
    collectorAuthToken: string | null,
    vdafVerifyKey: EncodedBlob,
    maxBatchQueryCount: number,
    minBatchSize: number,
    timePrecisionSeconds: number,
    collectorHpkeConfig: string,
    taskExpiration: number,
  ): Promise<void> {
    const requestBody: Record<string, string | number | object> = {
      task_id: id.toString(),
      leader: leaderEndpoint.toString(),
      helper: helperEndpoint.toString(),
      vdaf: vdaf,
      leader_authentication_token: aggregatorAuthToken,
      role: role,
      vdaf_verify_key: vdafVerifyKey.toString(),
      max_batch_query_count: maxBatchQueryCount,
      query_type: 1,
      min_batch_size: minBatchSize,
      time_precision: timePrecisionSeconds,
      collector_hpke_config: collectorHpkeConfig,
      task_expiration: taskExpiration,
    };
    if (collectorAuthToken !== null) {
      requestBody["collector_authentication_token"] = collectorAuthToken;
    }
    await this.sendRequest("add_task", requestBody);
  }
}

class Collector extends Container {
  /** Send an /internal/test/add_task request, and return the encoded collector HPKE configuration. */
  async addTask(
    id: EncodedBlob,
    leaderEndpoint: URL,
    vdaf: object,
    collectorAuthToken: string,
  ): Promise<string> {
    const rawBody = await this.sendRequest("add_task", {
      task_id: id.toString(),
      leader: leaderEndpoint.toString(),
      vdaf: vdaf,
      collector_authentication_token: collectorAuthToken,
      query_type: 1,
    });

    if (!("collector_hpke_config" in rawBody)) {
      throw new Error("`collector_hpke_config` is missing");
    }

    const body = rawBody as { collector_hpke_config: unknown };
    if (typeof body.collector_hpke_config !== "string") {
      throw new Error("`collector_hpke_config` is not a string");
    }
    return body.collector_hpke_config;
  }

  /** Send an /internal/test/collection_start request, and return the handle for the request. */
  async collectionStart(
    id: EncodedBlob,
    batchIntervalStart: number,
    batchIntervalDuration: number,
  ): Promise<string> {
    const rawBody = await this.sendRequest("collection_start", {
      task_id: id.toString(),
      agg_param: "",
      query: {
        type: 1,
        batch_interval_start: batchIntervalStart,
        batch_interval_duration: batchIntervalDuration,
      },
    });

    if (!("handle" in rawBody)) {
      throw new Error("`handle` is missing");
    }

    const body = rawBody as { handle: unknown };
    if (typeof body.handle !== "string") {
      throw new Error("`handle` is not a string");
    }
    return body.handle;
  }

  /**
  Send an /internal/test/collection_poll request, and return the collection's results if they are
  ready, or null if the collection is still being processed.
  */
  async collectionPoll(handle: string): Promise<Collection | null> {
    const rawBody = await this.sendRequest("collection_poll", {
      handle: handle,
    });

    if (rawBody.status === "in progress") {
      return null;
    }

    if (!("result" in rawBody)) {
      throw new Error("`result` is missing");
    }
    if (!("report_count" in rawBody)) {
      throw new Error("`report_count` is missing");
    }

    const body = rawBody as { result: unknown; report_count: unknown };
    if (typeof body.result !== "string" && !Array.isArray(body.result)) {
      throw new Error("`result` is not a string or array");
    }
    if (typeof body.report_count !== "number") {
      throw new Error("`report_count` is not a number");
    }
    return {
      result: body.result,
      reportCount: body.report_count,
    };
  }
}

type Collection = {
  result: string | Array<string>;
  reportCount: number;
};

async function upload(
  clientPort: number,
  id: EncodedBlob,
  leaderEndpoint: URL,
  helperEndpoint: URL,
  vdaf: object,
  measurement: unknown,
  timePrecision: number,
): Promise<void> {
  const response = await fetch(
    `http://127.0.0.1:${clientPort}/internal/test/upload`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task_id: id.toString(),
        leader: leaderEndpoint.toString(),
        helper: helperEndpoint.toString(),
        vdaf: vdaf,
        measurement: measurement,
        time_precision: timePrecision,
      }),
    },
  );
  await checkResponseError(response);
}

class EncodedBlob {
  buffer: Buffer;

  constructor(input: Buffer) {
    this.buffer = input;
  }

  static random(length: number): EncodedBlob {
    return new EncodedBlob(Buffer.from(randomBytes(length)));
  }

  toString(): string {
    return this.buffer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls and waits for an interop API server listening on a given port to be ready. */
async function waitForReady(port: number) {
  for (let i = 0; i < 15; i++) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/internal/test/ready`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      if (response.status === 200) {
        return;
      }
      await sleep(1000);
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("Timed out waiting for server to be ready");
}

async function runIntegrationTest(
  clientPort: number,
  clientOnLocalhost: boolean,
  leader: Aggregator,
  helper: Aggregator,
  collector: Collector,
  vdaf: object,
  measurements: Array<unknown>,
  expectedResult: unknown,
) {
  const maxBatchQueryCount = 1;
  const minBatchSize = measurements.length;
  const timePrecision = 300;
  const taskExpiration = 9000000000;

  await waitForReady(clientPort);
  await leader.waitForReady();
  await helper.waitForReady();
  await collector.waitForReady();

  const id = EncodedBlob.random(32);
  const aggregatorAuthToken = `aggregator-${randomSuffix()}`;
  const collectorAuthToken = `collector-${randomSuffix()}`;
  const vdafVerifyKey = EncodedBlob.random(16);

  const leaderEndpoint = await leader.endpointForTask(id, "leader");
  const helperEndpoint = await helper.endpointForTask(id, "helper");

  const collectorHpkeConfig = await collector.addTask(
    id,
    leaderEndpoint,
    vdaf,
    collectorAuthToken,
  );
  await leader.addTask(
    id,
    "leader",
    leaderEndpoint,
    helperEndpoint,
    vdaf,
    aggregatorAuthToken,
    collectorAuthToken,
    vdafVerifyKey,
    maxBatchQueryCount,
    minBatchSize,
    timePrecision,
    collectorHpkeConfig,
    taskExpiration,
  );
  await helper.addTask(
    id,
    "helper",
    leaderEndpoint,
    helperEndpoint,
    vdaf,
    aggregatorAuthToken,
    null,
    vdafVerifyKey,
    maxBatchQueryCount,
    minBatchSize,
    timePrecision,
    collectorHpkeConfig,
    taskExpiration,
  );

  let leaderEndpointForClient: URL;
  let helperEndpointForClient: URL;
  if (clientOnLocalhost) {
    leaderEndpointForClient = new URL(
      leaderEndpoint
        .toString()
        .replace(`${leader.name}:8080`, `127.0.0.1:${leader.port}`),
    );
    helperEndpointForClient = new URL(
      helperEndpoint
        .toString()
        .replace(`${helper.name}:8080`, `127.0.0.1:${helper.port}`),
    );
  } else {
    leaderEndpointForClient = leaderEndpoint;
    helperEndpointForClient = helperEndpoint;
  }

  const start = new Date();
  for (const measurement of measurements) {
    await upload(
      clientPort,
      id,
      leaderEndpointForClient,
      helperEndpointForClient,
      vdaf,
      measurement,
      timePrecision,
    );
  }

  const collectHandle = await collector.collectionStart(
    id,
    Math.floor(start.getTime() / 1000 / timePrecision) * timePrecision,
    timePrecision * 2,
  );
  for (let i = 0; i < 30; i++) {
    const collection = await collector.collectionPoll(collectHandle);
    if (collection === null) {
      await sleep(1000);
      continue;
    }

    if (collection.reportCount != measurements.length) {
      throw new Error("Number of reports did not match");
    }

    if (Array.isArray(collection.result) && Array.isArray(expectedResult)) {
      if (collection.result.length !== expectedResult.length) {
        throw new Error("Aggregate result had wrong length");
      }
      for (let i = 0; i < expectedResult.length; i++) {
        if (parseInt(collection.result[i], 10) !== expectedResult[i]) {
          throw new Error(
            `Aggregate result did not match, got ${JSON.stringify(
              collection.result,
            )}, expected ${JSON.stringify(expectedResult)}`,
          );
        }
      }
    } else if (
      typeof collection.result === "string" &&
      typeof expectedResult === "number"
    ) {
      if (parseInt(collection.result, 10) !== expectedResult) {
        throw new Error(
          `Aggregate result did not match, got ${collection.result}, expected ${expectedResult}`,
        );
      }
    } else {
      throw new Error("`result` was of unexpected type");
    }

    return;
  }
  throw new Error("Timed out waiting for collection to finish");
}

async function runIntegrationTestWithHostClient(
  clientPort: number,
  vdaf: object,
  measurement: Array<unknown>,
  expectedResult: unknown,
) {
  const suffix = randomSuffix();
  const network = new Network(`divviup-ts-interop-${suffix}`);
  try {
    const leader = new Aggregator(
      JANUS_INTEROP_AGGREGATOR_IMAGE,
      `leader-${suffix}`,
      network,
    );
    try {
      const helper = new Aggregator(
        JANUS_INTEROP_AGGREGATOR_IMAGE,
        `helper-${suffix}`,
        network,
      );
      try {
        const collector = new Collector(
          JANUS_INTEROP_COLLECTOR_IMAGE,
          `collector-${suffix}`,
          network,
        );
        try {
          await runIntegrationTest(
            clientPort,
            true,
            leader,
            helper,
            collector,
            vdaf,
            measurement,
            expectedResult,
          );
        } finally {
          collector.delete();
        }
      } finally {
        helper.delete();
      }
    } finally {
      leader.delete();
    }
  } finally {
    network.tryDisconnect(`collector-${suffix}`);
    network.tryDisconnect(`helper-${suffix}`);
    network.tryDisconnect(`leader-${suffix}`);
    network.delete();
  }
}

function startServer(): Promise<Server> {
  return new Promise((resolve) => {
    const server: Server = app().listen(0, "127.0.0.1", 511, () =>
      resolve(server),
    );
  });
}

describe("interoperation test", function () {
  this.timeout(60000);

  it("Prio3Count is compatible with Janus", async () => {
    const server: Server = await startServer();
    try {
      const clientPort = (server.address() as AddressInfo).port;
      await runIntegrationTestWithHostClient(
        clientPort,
        { type: "Prio3Count" },
        arr(10, () => 1),
        10,
      );
    } finally {
      server.close();
    }
  });

  it("Prio3Sum is compatible with Janus", async () => {
    const server: Server = await startServer();
    try {
      const clientPort = (server.address() as AddressInfo).port;
      await runIntegrationTestWithHostClient(
        clientPort,
        {
          type: "Prio3Sum",
          bits: "16",
        },
        arr(10, (i) => `${i}`),
        (9 * 10) / 2,
      );
    } finally {
      server.close();
    }
  });

  it("Prio3Histogram is compatible with Janus", async () => {
    const server: Server = await startServer();
    try {
      const clientPort = (server.address() as AddressInfo).port;
      await runIntegrationTestWithHostClient(
        clientPort,
        { type: "Prio3Histogram", length: "4", chunk_length: "2" },
        ["0", "1", "3", "1", "2"],
        [1, 2, 1, 1],
      );
    } finally {
      server.close();
    }
  });

  it("Prio3SumVec is compatible with Janus", async () => {
    const server: Server = await startServer();
    try {
      const clientPort = (server.address() as AddressInfo).port;
      await runIntegrationTestWithHostClient(
        clientPort,
        { type: "Prio3SumVec", length: "5", bits: "32", chunk_length: "3" },
        [
          ["67", "216", "2012", "52", "10"],
          ["100", "0", "0", "1", "0"],
        ],
        [167, 216, 2012, 53, 10],
      );
    } finally {
      server.close();
    }
  });
});
