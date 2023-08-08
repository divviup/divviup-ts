import { DAPClient } from "@divviup/dap";
import { KnownVdafSpec } from "@divviup/dap/dist/client";

type Fetch = (
  input: RequestInfo,
  init?: RequestInit | undefined,
) => Promise<Response>;

interface PublicTask {
  id: string;
  vdaf: KnownVdafSpec;
  leader: string;
  helper: string;
  time_precision_seconds: number;
}

type AnyMeasurement = number | bigint | boolean;
type GenericDAPClient = DAPClient<KnownVdafSpec, AnyMeasurement>;

export class DivviupClient {
  #baseUrl = new URL("https://api.staging.divviup.org/tasks");
  #fetch: Fetch = globalThis.fetch.bind(globalThis);
  #dapClient: null | GenericDAPClient = null;
  #taskUrl: URL;

  /** @internal */
  set fetch(fetch: Fetch) {
    this.#fetch = fetch;
    if (this.#dapClient) this.#dapClient.fetch = fetch;
  }

  constructor(urlOrTaskId: string | URL) {
    if (typeof urlOrTaskId === "string") {
      try {
        this.#taskUrl = new URL(urlOrTaskId);
      } catch (e) {
        this.#taskUrl = new URL(`${this.#baseUrl}/${urlOrTaskId}`);
      }
    } else {
      this.#taskUrl = urlOrTaskId;
    }
  }

  private async taskClient(): Promise<GenericDAPClient> {
    if (this.#dapClient) return this.#dapClient;
    let response = await this.#fetch(this.#taskUrl.toString());
    let task = (await response.json()) as PublicTask;
    let { leader, helper, vdaf, id, time_precision_seconds } = task;
    let client = new DAPClient({
      taskId: id,
      leader,
      helper,
      id,
      timePrecisionSeconds: time_precision_seconds,
      ...vdaf,
    });
    client.fetch = this.#fetch;
    this.#dapClient = client;
    return client;
  }

  async sendMeasurement(measurement: AnyMeasurement) {
    const client = await this.taskClient();
    return client.sendMeasurement(measurement);
  }
}

export default DivviupClient;

export async function sendMeasurement(
  urlOrTaskId: string | URL,
  measurement: AnyMeasurement,
  fetch?: Fetch,
) {
  let client = new DivviupClient(urlOrTaskId);
  if (fetch) client.fetch = fetch;
  return client.sendMeasurement(measurement);
}
