import { Buffer } from "buffer";
import { TaskId } from "./taskId.js";
import { ReportId } from "./reportId.js";
import {
  Report,
  ReportMetadata,
  InputShareAad,
  PlaintextInputShare,
} from "./report.js";
import { HpkeConfigList } from "./hpkeConfig.js";
import type { ClientVdaf } from "@divviup/vdaf";
import { Extension } from "./extension.js";
import { DAPError } from "./errors.js";
import { CONTENT_TYPES, DAP_VERSION } from "./constants.js";
import { Aggregator } from "./aggregator.js";
import { Prio3Count, Prio3Histogram, Prio3Sum } from "@divviup/prio3";
import { randomBytes } from "@divviup/common";

export { TaskId } from "./taskId.js";

export interface ReportOptions {
  timestamp?: Date;
}

/**
   Parameters from which to build a Task
   @typeParam Measurement The Measurement for the provided vdaf, usually inferred from the vdaf.
*/
export interface ClientParameters {
  /**
     The task identifier for this {@linkcode Task}. This can be specified
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
     the url of the helper aggregator, specified as either a string or
     {@linkcode URL}s.
  */
  helper: string | URL;
  /**
     The task's minimum batch duration, in seconds. Report timestamps will be
     rounded down to a multiple of this.
   */
  timePrecisionSeconds: number;
}

type Fetch = (
  input: RequestInfo,
  init?: RequestInit | undefined,
) => Promise<Response>;

interface KnownVdafs {
  sum: typeof Prio3Sum;
  count: typeof Prio3Count;
  histogram: typeof Prio3Histogram;
}

type KnownVdafNames = keyof KnownVdafs;
export type KnownVdafSpec = {
  [Key in KnownVdafNames]: Omit<
    { type: Key } & ConstructorParameters<KnownVdafs[Key]>[0],
    "shares"
  >;
}[KnownVdafNames];
type KnownVdaf<Spec extends KnownVdafSpec> = KnownVdafs[Spec["type"]];
type VdafInstance<Spec extends KnownVdafSpec> = InstanceType<KnownVdaf<Spec>>;
export type VdafMeasurement<Spec extends KnownVdafSpec> = Parameters<
  VdafInstance<Spec>["measurementToInputShares"]
>[0];
function vdafFromSpec<Spec extends KnownVdafSpec>(
  spec: Spec,
  shares = 2,
): VdafInstance<Spec> {
  switch (spec.type) {
    case "count":
      return new Prio3Count({ ...spec, shares }) as VdafInstance<Spec>;
    case "histogram":
      return new Prio3Histogram({
        ...spec,
        shares,
      }) as VdafInstance<Spec>;
    case "sum":
      return new Prio3Sum({ ...spec, shares }) as VdafInstance<Spec>;
  }
}

/**
   A client for interacting with DAP servers, as specified by
   [draft-ietf-ppm-dap-02](https://datatracker.ietf.org/doc/html/draft-ietf-ppm-dap/02/). Instances
   of this class contain all of the necessary functionality to
   generate a privacy-preserving measurement report for the provided
   {@linkcode ClientVdaf}, such as an implementation of Prio3, as specified by
   [draft-irtf-cfrg-vdaf-03](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-vdaf/03/).
*/
export class Task<
  Spec extends KnownVdafSpec,
  Measurement extends VdafMeasurement<Spec>,
> {
  #vdaf: ClientVdaf<Measurement>;
  #taskId: TaskId;
  #aggregators: Aggregator[];
  #timePrecisionSeconds: number;
  #extensions: Extension[] = [];
  #fetch: Fetch = globalThis.fetch.bind(globalThis);
  #hpkeConfigsWereInvalid = false;

  /** the protocol version for this task, usually in the form `dap-{nn}` */
  static readonly protocolVersion = DAP_VERSION;

  /**
     Builds a new Task from the {@linkcode ClientParameters} provided. 
   */
  constructor(parameters: ClientParameters & Spec) {
    this.#vdaf = vdafFromSpec(parameters) as ClientVdaf<Measurement>;
    this.#taskId = taskIdFromDefinition(parameters.taskId);
    this.#aggregators = aggregatorsFromParameters(parameters);
    if (typeof parameters.timePrecisionSeconds !== "number") {
      throw new Error("timePrecisionSeconds must be a number");
    }
    this.#timePrecisionSeconds = parameters.timePrecisionSeconds;
  }

  /** @internal */
  //this exists for testing, and should not be considered part of the public api.
  get aggregators(): Aggregator[] {
    return this.#aggregators;
  }

  /** @internal */
  //this exists for testing, and should not be considered part of the public api.
  get vdaf(): ClientVdaf<Measurement> {
    return this.#vdaf;
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
     
     This may make network requests to fetch key configuration from the
     leader and helper, if needed.

     @param measurement The type of this argument will be determined
     by the Vdaf that this task is constructed for.

     @throws `Error` if there is any issue in generating the report
   */
  async generateReport(
    measurement: Measurement,
    options?: ReportOptions,
  ): Promise<Report> {
    await this.fetchKeyConfiguration();
    const reportId = ReportId.random();
    const rand = Buffer.from(randomBytes(this.#vdaf.randSize));
    const { publicShare, inputShares } =
      await this.#vdaf.measurementToInputShares(
        measurement,
        reportId.encode(),
        rand,
      );

    const time = roundedTime(this.#timePrecisionSeconds, options?.timestamp);
    const metadata = new ReportMetadata(reportId, time);
    const aad = new InputShareAad(this.taskId, metadata, publicShare);
    const ciphertexts = await Promise.all(
      this.#aggregators.map((aggregator, i) =>
        aggregator.seal(
          new PlaintextInputShare(this.#extensions, inputShares[i]),
          aad,
        ),
      ),
    );

    return new Report(metadata, publicShare, ciphertexts);
  }

  /**
     Sends a pregenerated {@linkcode Report} to the leader aggregator.
     
     @param report The {@linkcode Report} to send.

     @throws {@linkcode DAPError} if the response is not Ok.
   */
  async sendReport(report: Report) {
    const body = report.encode();
    const leader = this.#aggregators[0];
    const taskId = this.#taskId.toString();
    const response = await this.#fetch(
      new URL(`tasks/${taskId}/reports`, leader.url).toString(),
      {
        method: "PUT",
        headers: { "Content-Type": CONTENT_TYPES.REPORT },
        body,
      },
    );

    if (!response.ok) {
      throw await DAPError.fromResponse(response, "report upload failed");
    }
  }

  private hasKeyConfiguration(): boolean {
    return this.#aggregators.every((aggregator) => !!aggregator.hpkeConfigList);
  }

  /**

     A convenience function to fetch the key configuration (if
     needed), generate a report from the provided measurement and send
     that report to the leader aggregator.

     This will call {@linkcode Task.generateReport} and
     {@linkcode Task.sendReport}, while automatically handling
     any errors due to server key rotation with re-encryption and a
     retry.

     @throws {@linkcode DAPError} if any http response is not Ok or
     `Error` if there is an issue generating the report
   */
  async sendMeasurement(
    measurement: Measurement,
    options?: ReportOptions,
  ): Promise<void> {
    const report = await this.generateReport(measurement, options);

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
      delete aggregator.hpkeConfigList;
    }
  }

  /**
     Fetches hpke configuration from the configured aggregators over
     the network. This will make one http/https request for each
     aggregator (leader and helper).

     @throws {@linkcode DAPError} if any response is not Ok.
     */

  async fetchKeyConfiguration(): Promise<void> {
    if (this.hasKeyConfiguration()) return;
    await Promise.all(
      this.#aggregators.map(async (aggregator) => {
        const url = new URL("hpke_config", aggregator.url);
        url.searchParams.append("task_id", this.#taskId.toString());

        const response = await this.#fetch(url.toString(), {
          headers: { Accept: CONTENT_TYPES.HPKE_CONFIG_LIST },
        });

        if (!response.ok) {
          throw await DAPError.fromResponse(
            response,
            `fetchKeyConfiguration received a ${response.status} response, aborting`,
          );
        }

        const blob = await response.blob();

        if (blob.type !== CONTENT_TYPES.HPKE_CONFIG_LIST) {
          throw new Error(
            `expected ${CONTENT_TYPES.HPKE_CONFIG_LIST} content-type header, aborting`,
          );
        }

        aggregator.hpkeConfigList = HpkeConfigList.parse(
          await blob.arrayBuffer(),
        );

        aggregator.hpkeConfigList.selectConfig();
      }),
    );
  }
}

function aggregatorsFromParameters({
  leader,
  helper,
}: ClientParameters): Aggregator[] {
  return [Aggregator.leader(leader), Aggregator.helper(helper)];
}

function taskIdFromDefinition(
  taskIdDefinition: Buffer | TaskId | string,
): TaskId {
  if (taskIdDefinition instanceof TaskId) return taskIdDefinition;
  else return new TaskId(taskIdDefinition);
}

function roundedTime(timePrecisionSeconds: number, date?: Date): number {
  const epochSeconds = (date ? date.getTime() : Date.now()) / 1000;
  const roundedSeconds =
    Math.floor(epochSeconds / timePrecisionSeconds) * timePrecisionSeconds;
  return roundedSeconds;
}
