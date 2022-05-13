import {
  fetch as actualFetch,
  RequestInit,
  RequestInfo,
  Response,
} from "undici";
import { TaskId } from "dap/taskId";
import { Nonce } from "dap/nonce";
import { Report } from "dap/report";
import { HpkeConfig } from "dap/hpkeConfig";
import { Vdaf } from "vdaf";
import { Extension } from "./extension";
import { encodeArray } from "./encoding";

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
  privateKey: Buffer;
  role: Role;
  hpkeConfig?: HpkeConfig;
}

export interface Parameters<M, PP> {
  vdaf: ClientVdaf<M, PP>;
  taskId: TaskId;
  minimumBatchSize: number;
  aggregators: Aggregator[];
}

type Fetch = (
  input: RequestInfo,
  init?: RequestInit | undefined
) => Promise<Response>;

export const ROUTES = Object.freeze({
  keyConfig: "/key_config",
  upload: "/upload",
});

export const VERSION = "dap-00";

export const INPUT_SHARE_ASCII = Object.freeze([
  ...Buffer.from(`${VERSION} input share`, "ascii"),
  1,
]);

export const CONTENT_TYPES = Object.freeze({
  REPORT: "message/dap-report",
  HPKE_CONFIG: "message/dap-hpke-config",
});

export class DAPClient<M, PP> implements Parameters<M, PP> {
  vdaf: ClientVdaf<M, PP>;
  taskId: TaskId;
  minimumBatchSize: number;
  aggregators: Aggregator[];
  fetch: Fetch;
  keyConfig?: HpkeConfig[];
  extensions: Extension[] = [];

  constructor(parameters: Parameters<M, PP>, fetch: Fetch = actualFetch) {
    this.vdaf = parameters.vdaf;
    this.taskId = parameters.taskId;
    this.minimumBatchSize = parameters.minimumBatchSize;
    this.aggregators = parameters.aggregators;
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
      const info = Buffer.from([...INPUT_SHARE_ASCII, aggregator.role]);
      const aad = Buffer.concat([
        this.taskId.encode(),
        nonce.encode(),
        encodeArray(this.extensions),
      ]);
      return aggregator.hpkeConfig.seal(info, share, aad);
    });

    return new Report(
      this.taskId,
      Nonce.generate(),
      this.extensions,
      ciphertexts
    );
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
      throw new Error("report upload failed");
    }
  }

  fetchKeyConfiguration(): Promise<HpkeConfig[]> {
    return Promise.all(
      this.aggregators.map(async (aggregator) => {
        const response = await this.fetch(
          new URL(ROUTES.keyConfig, aggregator.url).toString(),
          { headers: { Accept: CONTENT_TYPES.HPKE_CONFIG } }
        );
        if (!response.ok) {
          throw new Error(
            `makeKeyConfigurationRequest received a ${response.status} response, aborting`
          );
        }

        const blob = await response.blob();

        if (blob.type !== CONTENT_TYPES.HPKE_CONFIG) {
          throw new Error(
            `expected ${CONTENT_TYPES.HPKE_CONFIG} content-type header`
          );
        }

        const hpkeConfig = HpkeConfig.parse(await blob.arrayBuffer());
        aggregator.hpkeConfig = hpkeConfig;
        return hpkeConfig;
      })
    );
  }
}
