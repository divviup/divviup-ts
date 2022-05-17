import { TaskId } from "dap/taskId";
import { Nonce } from "dap/nonce";
import { Report } from "dap/report";
import { HpkeConfig } from "dap/hpkeConfig";
import { Vdaf } from "vdaf";
import { Extension } from "dap/extension";
import { encodeArray } from "dap/encoding";
import { DAPError } from "dap/errors";

export { TaskId } from "dap/taskId";

import {
  fetch as actualFetch,
  RequestInit,
  RequestInfo,
  Response,
} from "undici";

export enum Role {
  Collector = 0,
  Client = 1,
  Leader = 2,
  Helper = 3,
}

export type ClientVdaf<M, PP> = Vdaf<
  M,
  PP,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown
>;

export interface Aggregator {
  url: URL;
  role: Role;
  hpkeConfig?: HpkeConfig;
}

export interface Parameters<M, PP> {
  vdaf: ClientVdaf<M, PP>;
  taskId: TaskId | Buffer | string;
  leader: string | URL;
  helpers: (string | URL)[];
}

type Fetch = (
  input: RequestInfo,
  init?: RequestInit | undefined
) => Promise<Response>;

export const ROUTES = Object.freeze({
  keyConfig: "/hpke_config",
  upload: "/upload",
});

export const DAP_VERSION = "ppm";

export const INPUT_SHARE_ASCII = Object.freeze([
  ...Buffer.from(`${DAP_VERSION} input share`, "ascii"),
  1,
]);

export const CONTENT_TYPES = Object.freeze({
  REPORT: "message/dap-report",
  HPKE_CONFIG: "message/dap-hpke-config",
});

function aggregatorsFromParameters<M, PP>({
  leader,
  helpers,
}: Parameters<M, PP>): Aggregator[] {
  return [
    {
      url: new URL(leader),
      role: Role.Leader,
    },
    ...helpers.map((url) => ({
      url: new URL(url),
      role: Role.Helper,
    })),
  ];
}

function taskIdFromDefinition(
  taskIdDefinition: Buffer | TaskId | string
): TaskId {
  if (typeof taskIdDefinition === "string")
    taskIdDefinition = Buffer.from(taskIdDefinition, "base64url");

  if (taskIdDefinition instanceof TaskId) return taskIdDefinition;

  return new TaskId(taskIdDefinition);
}

export class DAPClient<M, PP> {
  vdaf: ClientVdaf<M, PP>;
  taskId: TaskId;
  aggregators: Aggregator[];
  fetch: Fetch;
  keyConfig?: HpkeConfig[];
  extensions: Extension[] = [];

  constructor(parameters: Parameters<M, PP>, fetch: Fetch = actualFetch) {
    this.vdaf = parameters.vdaf;
    this.taskId = taskIdFromDefinition(parameters.taskId);
    this.aggregators = aggregatorsFromParameters(parameters);
    this.fetch = fetch;
  }

  async generateReport(measurement: M, publicParam: PP): Promise<Report> {
    const inputShares = await this.vdaf.measurementToInputShares(
      publicParam,
      measurement
    );

    const nonce = Nonce.generate();

    const ciphertexts = this.aggregators.map((aggregator, i) => {
      if (!aggregator.hpkeConfig) {
        throw new Error(
          "cannot call runVdaf on a DAPClient that has not yet fetched key configuration"
        );
      }
      const share = inputShares[i];

      const info = Buffer.from([
        ...this.taskId.encode(), //<-this moves to aad soon
        ...INPUT_SHARE_ASCII,
        aggregator.role,
      ]);

      const aad = Buffer.concat([
        //        this.taskId.encode(), <- to here
        nonce.encode(),
        encodeArray(this.extensions),
      ]);
      return aggregator.hpkeConfig.seal(info, share, aad);
    });

    return new Report(this.taskId, nonce, this.extensions, ciphertexts);
  }

  async sendReport(report: Report) {
    const body = report.encode();
    const leader = this.aggregators[0];
    const response = await this.fetch(
      new URL(ROUTES.upload, leader.url).toString(),
      {
        method: "POST",
        headers: { "Content-Type": CONTENT_TYPES.REPORT },
        body,
      }
    );

    if (!response.ok) {
      throw await DAPError.fromResponse(response, "report upload failed");
    }
  }

  fetchKeyConfiguration(): Promise<HpkeConfig[]> {
    return Promise.all(
      this.aggregators.map(async (aggregator) => {
        const url = new URL(ROUTES.keyConfig, aggregator.url);
        url.searchParams.append(
          "task_id",
          this.taskId.buffer.toString("base64url")
        );

        const response = await this.fetch(url, {
          headers: { Accept: CONTENT_TYPES.HPKE_CONFIG },
        });

        if (!response.ok) {
          throw await DAPError.fromResponse(
            response,
            `makeKeyConfigurationRequest received a ${response.status} response, aborting`
          );
        }

        const blob = await response.blob();

        if (blob.type !== CONTENT_TYPES.HPKE_CONFIG) {
          ///          throw new Error( <- this is the correct behavior, but janus sends a generic content-type currently
          ///             `expected ${CONTENT_TYPES.HPKE_CONFIG} content-type header, aborting`
          ///          );
          console.error(
            `expected ${CONTENT_TYPES.HPKE_CONFIG} content-type header, continuing for now`
          );
        }

        const hpkeConfig = HpkeConfig.parse(await blob.arrayBuffer());
        aggregator.hpkeConfig = hpkeConfig;
        return hpkeConfig;
      })
    );
  }
}
