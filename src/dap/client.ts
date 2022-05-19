import { TaskId } from "dap/taskId";
import { Nonce } from "dap/nonce";
import { Report } from "dap/report";
import { HpkeConfig } from "dap/hpkeConfig";
import { ClientVdaf } from "vdaf";
import { Extension } from "dap/extension";
import { encodeArray16 } from "dap/encoding";
import { DAPError } from "dap/errors";

export { TaskId } from "dap/taskId";

import {
  fetch as actualFetch,
  RequestInit,
  RequestInfo,
  Response,
} from "undici";

enum Role {
  Collector = 0,
  Client = 1,
  Leader = 2,
  Helper = 3,
}

interface Aggregator {
  url: URL;
  role: Role;
  hpkeConfig?: HpkeConfig;
}

/**
   Parameters from which to build a DAPClient
   @typeParam Measurement The Measurement for the provided vdaf, usually inferred from the vdaf.
*/
export interface ClientParameters<Measurement> {
  /**
     A {@linkcode ClientVdaf} that this {@linkcode DAPClient} will use
     to generate reports. The measurement passed to generateReport
     must be the `Measurement` that this ClientVdaf supports.
  */

  vdaf: ClientVdaf<Measurement>;

  /**
     The task identifier for this {@linkcode DAPClient}. This can be specified
     either as a Buffer, a {@linkcode TaskId} or a base64url-encoded
     string
  **/
  taskId: TaskId | Buffer | string;
  /**
     the url of the leader aggregator, specified as either a string
     or a {@linkcode URL}
  */
  leader: string | URL;
  /**
     the url of the helper aggregators, specified as an array of either
     strings or {@linkcode URL}s.
  */
  helpers: (string | URL)[];
}

type Fetch = (
  input: RequestInfo,
  init?: RequestInit | undefined
) => Promise<Response>;

const ROUTES = Object.freeze({
  keyConfig: "/hpke_config",
  upload: "/upload",
});

/**
   The protocol version for this DAP implementation. Usually of the
   form `dap-{nn}`.
*/
const DAP_VERSION = "ppm";

/** A Buffer that will always equal `${DAP_VERSION} input share\x01` */
const INPUT_SHARE_ASCII = Object.freeze([
  ...Buffer.from(`${DAP_VERSION} input share`, "ascii"),
  1,
]);

const CONTENT_TYPES = Object.freeze({
  REPORT: "message/dap-report",
  HPKE_CONFIG: "message/dap-hpke-config",
});

/**
   A client for interacting with DAP servers, as specified by
   [draft-ietf-ppm-dap-00](https://datatracker.ietf.org/doc/html/draft-ietf-ppm-dap). Instances
   of this class contain all of the necessary functionality to
   generate a privacy-preserving measurement report for the provided
   {@linkcode ClientVdaf}, such as an implementation of Prio3, as specified by
   [draft-irtf-cfrg-vdaf-00](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-vdaf).
*/
export class DAPClient<Measurement> {
  #vdaf: ClientVdaf<Measurement>;
  #taskId: TaskId;
  #aggregators: Aggregator[];
  #extensions: Extension[] = [];
  #fetch: Fetch = actualFetch;
  #hpkeConfigsWereInvalid = false;

  /** the protocol version for this client, usually in the form `dap-{nn}` */
  static readonly protocolVersion = DAP_VERSION;

  /**
     Builds a new DAPClient from the {@linkcode ClientParameters} provided. 
   */
  constructor(parameters: ClientParameters<Measurement>) {
    this.#vdaf = parameters.vdaf;
    this.#taskId = taskIdFromDefinition(parameters.taskId);
    this.#aggregators = aggregatorsFromParameters(parameters);
  }

  /** @internal */
  //this exists for testing, and should not be considered part of the public api.
  get aggregators(): Aggregator[] {
    return this.#aggregators;
  }

  /** @internal */
  //this exists for testing, and should not be considered part of the public api.
  set fetch(fetch: Fetch) {
    this.#fetch = fetch;
  }

  /** @internal */
  //this exists for testing, and should not be considered part of the public api.
  get taskId(): TaskId {
    return this.#taskId;
  }

  /**
     Produce a {@linkcode Report} from the supplied Measurement
     
     This method depends on the key configuration already having been
     fetched with {@linkcode DAPClient.fetchKeyConfiguration}. It will
     throw an error if you attempt to call it without having
     previously fetched key configuration.

     @param measurement The type of this argument will be determined
     by the Vdaf that this client is constructed for.

     @throws `Error` if there is any issue in generating the report
   */
  async generateReport(measurement: Measurement): Promise<Report> {
    await this.fetchKeyConfiguration();

    const inputShares = await this.#vdaf.measurementToInputShares(measurement);

    const nonce = Nonce.generate();
    const aad = Buffer.concat([
      //        this.taskId.encode(), <- soon
      nonce.encode(),
      encodeArray16(this.#extensions),
    ]);

    const ciphertexts = this.#aggregators.map((aggregator, i) => {
      if (!aggregator.hpkeConfig) {
        // This exists entirely to tell typescript it's ok to use the hpkeConfig.
        // Throwing an explicit error is preferable to `as HpkeConfig`
        throw new Error(
          "We fetched key configuration but this aggregator is missing hpkeConfig. " +
            "This should be unreachable; please file a bug report."
        );
      }

      const info = Buffer.from([
        ...this.#taskId.encode(), //<-this moves to aad soon
        ...INPUT_SHARE_ASCII,
        aggregator.role,
      ]);

      return aggregator.hpkeConfig.seal(info, inputShares[i], aad);
    });

    return new Report(this.#taskId, nonce, this.#extensions, ciphertexts);
  }

  /**
     Sends a pregenerated {@linkcode Report} to the leader aggregator.
     
     @param report The {@linkcode Report} to send.

     @throws {@linkcode DAPError} if the response is not Ok.
   */
  async sendReport(report: Report) {
    const body = report.encode();
    const leader = this.#aggregators[0];
    const response = await this.#fetch(
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

  private hasKeyConfiguration(): boolean {
    return this.#aggregators.every((aggregator) => !!aggregator.hpkeConfig);
  }

  /**

     A convenience function to fetch the key configuration (if
     needed), generate a report from the provided measurement and send
     that report to the leader aggregator.

     This is identical to calling {@linkcode
     DAPClient.fetchKeyConfiguration}, {@linkcode
     DAPClient.generateReport}, and {@linkcode DAPClient.sendReport}.

     @throws {@linkcode DAPError} if any http response is not Ok or
     `Error` if there is an issue generating the report
   */
  async sendMeasurement(measurement: Measurement): Promise<void> {
    const report = await this.generateReport(measurement);

    try {
      await this.sendReport(report);
      this.#hpkeConfigsWereInvalid = false;
    } catch (error) {
      if (
        error instanceof DAPError &&
        error.shortType === "outdatedConfig" &&
        !this.#hpkeConfigsWereInvalid // only retry once
      ) {
        this.invalidateHpkeConfig();
        await this.sendMeasurement(measurement);
      } else {
        throw error;
      }
    }
  }

  invalidateHpkeConfig() {
    this.#hpkeConfigsWereInvalid = true;
    for (const aggregator of this.#aggregators) {
      delete aggregator.hpkeConfig;
    }
  }

  /**
     Fetches hpke configuration from the configured aggregators over
     the network. This will make one http/https request for each
     aggregator (leader and helpers).

     @throws {@linkcode DAPError} if any response is not Ok.
     */

  async fetchKeyConfiguration(): Promise<void> {
    if (this.hasKeyConfiguration()) return;
    await Promise.all(
      this.#aggregators.map(async (aggregator) => {
        const url = new URL(ROUTES.keyConfig, aggregator.url);
        url.searchParams.append(
          "task_id",
          this.#taskId.buffer.toString("base64url")
        );

        const response = await this.#fetch(url, {
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
          throw new Error(
            `expected ${CONTENT_TYPES.HPKE_CONFIG} content-type header, aborting`
          );
        }

        aggregator.hpkeConfig = HpkeConfig.parse(await blob.arrayBuffer());
      })
    );
  }
}

function aggregatorsFromParameters<M>({
  leader,
  helpers,
}: ClientParameters<M>): Aggregator[] {
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
