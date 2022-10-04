// This script implements the client role of draft-dcook-ppm-dap-interop-test-design-01.
import express, { Request, Response } from "express";
import DAPClient from "@divviup/dap";

interface CountVdafObject {
  type: "Prio3Aes128Count",
}

interface SumVdafObject {
  type: "Prio3Aes128Sum",
  bits: number,
}

interface HistogramVdafObject {
  type: "Prio3Aes128Histogram",
  buckets: string[],
}

type VdafObject = CountVdafObject | SumVdafObject | HistogramVdafObject;

type Measurement = number | string | string[];

interface UploadRequest {
  taskId: string,
  leader: string,
  helper: string,
  vdaf: VdafObject,
  measurement: Measurement,
  nonceTime?: number,
  minBatchDuration: number,
}

function sanitizeRequest(rawBody: unknown): UploadRequest {
  if (typeof rawBody !== "object" || Array.isArray(rawBody) || rawBody === null) {
    throw new Error("JSON body is not an object");
  }

  if (!("taskId" in rawBody)) {
    throw new Error("Task ID is missing");
  }
  if (!("leader" in rawBody)) {
    throw new Error("Leader endpoint URL is missing");
  }
  if (!("helper" in rawBody)) {
    throw new Error("Helper endpoint URL is missing");
  }
  if (!("vdaf" in rawBody)) {
    throw new Error("VDAF definition is missing");
  }
  if (!("measurement" in rawBody)) {
    throw new Error("Measurement is missing");
  }
  if (!("minBatchDuration" in rawBody)) {
    throw new Error("Minimum batch duration is missing");
  }

  const body = rawBody as {
    taskId: unknown,
    leader: unknown,
    helper: unknown,
    vdaf: unknown,
    measurement: unknown,
    nonceTime?: unknown,
    minBatchDuration: unknown,
  };

  if (typeof body.taskId !== "string") {
    throw new Error("Task ID is not a string");
  }
  if (typeof body.leader !== "string") {
    throw new Error("Leader endpoint URL is not a string");
  }
  if (typeof body.helper !== "string") {
    throw new Error("Helper endpoint URL is not a string");
  }
  if (typeof body.vdaf !== "object" || Array.isArray(body.vdaf) || body.vdaf === null) {
    throw new Error("VDAF definition is not an object");
  }
  if (typeof body.measurement !== "number" && typeof body.measurement !== "string" && !Array.isArray(body.measurement)) {
    throw new Error("Measurement is not a number, string, or array");
  }
  if (body.nonceTime !== undefined && typeof body.nonceTime !== "number") {
    throw new Error("Nonce timestamp is not a number");
  }
  if (typeof body.minBatchDuration !== "number") {
    throw new Error("Minimum batch duration is not a number");
  }

  if (!("type" in body.vdaf)) {
    throw new Error("VDAF type is missing");
  }

  const vdaf = body.vdaf as {
    type: unknown,
    bits?: unknown,
    buckets?: unknown,
  };

  if (typeof vdaf.type !== "string") {
    throw new Error("VDAF type is not a string");
  }

  let vdafObject: VdafObject;
  let measurement: Measurement;

  switch (vdaf.type) {
    case "Prio3Aes128Count":
      measurement = Number(body.measurement);
      if (measurement !== 0 && measurement !== 1) {
        throw new Error("Measurement is not 0 or 1");
      }

      vdafObject = {
        type: vdaf.type,
      };
      break;

    case "Prio3Aes128Sum":
      if (!("bits" in vdaf)) {
        throw new Error("VDAF definition is missing number of bits");
      }
      if (typeof vdaf.bits !== "number") {
        throw new Error("VDAF definition's `bits` parameter is not a number");
      }
      if (typeof body.measurement !== "string") {
        throw new Error("Measurement is not a string");
      }

      vdafObject = {
        type: vdaf.type,
        bits: vdaf.bits,
      };
      measurement = body.measurement;
      break;

    case "Prio3Aes128Histogram":
      if (!("buckets" in vdaf)) {
        throw new Error("VDAF definition is missing buckets");
      }
      if (!Array.isArray(vdaf.buckets)) {
        throw new Error("VDAF definition's `buckets` parameter is not an array");
      }
      for (const bucketBoundary of vdaf.buckets) {
        if (typeof bucketBoundary !== "string") {
          throw new Error("VDAF defeinition's `buckets` parameter is not an array of strings");
        }
      }
      if (typeof body.measurement !== "string") {
        throw new Error("Measurement is not a string");
      }

      vdafObject = {
        type: vdaf.type,
        buckets: vdaf.buckets as string[],
      }
      measurement = body.measurement;
      break;

    default:
      throw new Error(`Unrecognized VDAF ${vdaf.type}`);
  }

  return {
    taskId: body.taskId,
    leader: body.leader,
    helper: body.helper,
    vdaf: vdafObject,
    measurement: measurement,
    nonceTime: body.nonceTime,
    minBatchDuration: body.minBatchDuration,
  }
}

function assertUnreachable(_: never): never {
  throw new Error("Unreachable code");
}

async function uploadHandler(req: Request, res: Response): Promise<void> {
  let body;
  try {
    body = sanitizeRequest(req.body);
  } catch (error) {
    console.error(error);
    res.status(400).send({"status": "error", "error": String(error)});
    return;
  }

  // TODO (issue #97): Implement a way to construct a report with a
  // custom nonce timestamp.
  if (body.nonceTime !== undefined) {
    const error = new Error("`nonceTime` is not yet supported");
    console.error(error);
    res.status(500).send({"status": "error", "error": String(error)});
    return;
  }

  try {
    switch (body.vdaf.type) {
      case "Prio3Aes128Count":
        await new DAPClient({
          taskId: body.taskId,
          leader: body.leader,
          helper: body.helper,
          minBatchDurationSeconds: body.minBatchDuration,
          type: "count",
        }).sendMeasurement(body.measurement !== 0);
        break;

      case "Prio3Aes128Sum":
        await new DAPClient({
          taskId: body.taskId,
          leader: body.leader,
          helper: body.helper,
          minBatchDurationSeconds: body.minBatchDuration,
          type: "sum",
          bits: body.vdaf.bits,
        }).sendMeasurement(Number(body.measurement));
        break;

      case "Prio3Aes128Histogram":
        await new DAPClient({
          taskId: body.taskId,
          leader: body.leader,
          helper: body.helper,
          minBatchDurationSeconds: body.minBatchDuration,
          type: "histogram",
          buckets: body.vdaf.buckets.map(Number),
        }).sendMeasurement(Number(body.measurement));
        break;

      default:
        assertUnreachable(body.vdaf);
    }
    console.log("Successful upload");
    res.send({"status": "success"});
  } catch (error) {
    console.log("Failed upload", error);
    // Send this with status 200 OK, as the error came from the DAP level,
    // not the test API level.
    res.send({"status": "error", "error": String(error)});
  }
}

export function interopTestClient() {
  const app = express();
  app.use(express.json());

  app.post("/internal/test/ready", (_req, res) => {
    res.send({});
  });

  app.post("/internal/test/upload", (req, res, next) => {
    uploadHandler(req, res).catch(next);
  });

  console.debug("Starting server on port 8080")
  app.listen(8080);
}
