import { app } from ".";
import { arr } from "@divviup/common";
import { AddressInfo } from "node:net";
import { spawnSync, SpawnSyncReturns } from "node:child_process";

const JANUS_INTEROP_AGGREGATOR_IMAGE =
  "us-west2-docker.pkg.dev/divviup-artifacts-public/janus/janus_interop_aggregator:0.3.1@sha256:badba0c9ecbe291368df507f42997ba0224774447cb02504fa9a406c4e49a968";
const JANUS_INTEROP_COLLECTOR_IMAGE =
  "us-west2-docker.pkg.dev/divviup-artifacts-public/janus/janus_interop_collector:0.3.1@sha256:12f7e170481794116a7f337d2b5b1fd6619e0d512573018aa546a0fb84a5f2b6";

const IDENTIFIER_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSuffix(): string {
  return arr(
    10,
    (_) =>
      IDENTIFIER_ALPHABET[
        Math.floor(Math.random() * IDENTIFIER_ALPHABET.length)
      ]
  ).join("");
}

function spawnSyncAndThrow(
  command: string,
  args: Array<string>
): SpawnSyncReturns<string> {
  const result = spawnSync(command, args, { encoding: "utf-8" });
  if (result.error) {
    throw result.error;
  } else if (result.status !== null && result.status !== 0) {
    throw Error(
      `${command} failed with status code ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  } else if (result.signal !== null) {
    throw Error(`${command} was killed with signal ${result.signal}`);
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
    const match = /^0\.0\.0\.0:([0-9]+)$/m.exec(result.stdout);
    if (!match) {
      throw Error(
        `docker port output could not be parsed, was ${result.stdout}`
      );
    }
    this.port = parseInt(match[1], 10);
  }

  delete() {
    spawnSync("docker", ["rm", "--force", this.name]);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/// Polls and waits for an interop API server listening on a given port to be ready.
async function waitForReady(port: number) {
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/internal/test/ready`
      );
      if (response.status === 200) {
        return;
      }
      await sleep(1000);
    } catch {
      await sleep(1000);
    }
  }
}

async function runIntegrationTest(
  clientPort: number,
  clientOnLocalhost: boolean,
  leader: Container,
  helper: Container,
  collector: Container
) {
  await waitForReady(clientPort);
  await waitForReady(leader.port);
  await waitForReady(helper.port);
  await waitForReady(collector.port);
  // TODO: task setup, upload, aggregate, and collect
}

async function runIntegrationTestWithHostClient(clientPort: number) {
  const suffix = randomSuffix();
  const network = new Network(`divviup-ts-interop-${suffix}`);
  try {
    const leader = new Container(
      JANUS_INTEROP_AGGREGATOR_IMAGE,
      `leader-${suffix}`,
      network
    );
    try {
      const helper = new Container(
        JANUS_INTEROP_AGGREGATOR_IMAGE,
        `helper-${suffix}`,
        network
      );
      try {
        const collector = new Container(
          JANUS_INTEROP_COLLECTOR_IMAGE,
          `collector-${suffix}`,
          network
        );
        try {
          await runIntegrationTest(clientPort, true, leader, helper, collector);
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

describe("interoperation test", function () {
  this.timeout(60000);
  it("is compatible with Janus", async () => {
    const server = app().listen(0);
    try {
      const clientPort = (server.address() as AddressInfo).port;
      await runIntegrationTestWithHostClient(clientPort);
    } finally {
      server.close();
    }
  });
});
