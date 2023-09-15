// This script implements the client role of draft-dcook-ppm-dap-interop-test-design-02.
import type { Request, Response } from "express";
import express from "express";
import type { ReportOptions } from "@divviup/dap";
import Task from "@divviup/dap";

import * as url from "node:url";
import * as fs from "node:fs";
try {
  if (fs.realpathSync(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
    run();
  }
} catch (_) {}

interface CountVdafObject {
  type: "Prio3Count";
}

interface SumVdafObject {
  type: "Prio3Sum";
  bits: number;
}

interface HistogramVdafObject {
  type: "Prio3Histogram";
  buckets: string[];
}

type VdafObject = CountVdafObject | SumVdafObject | HistogramVdafObject;

type Measurement = number | string | string[];

interface UploadRequest {
  task_id: string;
  leader: string;
  helper: string;
  vdaf: VdafObject;
  measurement: Measurement;
  time?: number;
  time_precision: number;
}

function sanitizeRequest(rawBody: unknown): UploadRequest {
  if (
    typeof rawBody !== "object" ||
    Array.isArray(rawBody) ||
    rawBody === null
  ) {
    throw new Error("JSON body is not an object");
  }

  if (!("task_id" in rawBody)) {
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
  if (!("time_precision" in rawBody)) {
    throw new Error("Time precision is missing");
  }

  const body = rawBody as {
    task_id: unknown;
    leader: unknown;
    helper: unknown;
    vdaf: unknown;
    measurement: unknown;
    time?: unknown;
    time_precision: unknown;
  };

  if (typeof body.task_id !== "string") {
    throw new Error("Task ID is not a string");
  }
  if (typeof body.leader !== "string") {
    throw new Error("Leader endpoint URL is not a string");
  }
  if (typeof body.helper !== "string") {
    throw new Error("Helper endpoint URL is not a string");
  }
  if (
    typeof body.vdaf !== "object" ||
    Array.isArray(body.vdaf) ||
    body.vdaf === null
  ) {
    throw new Error("VDAF definition is not an object");
  }
  if (
    typeof body.measurement !== "number" &&
    typeof body.measurement !== "string" &&
    !Array.isArray(body.measurement)
  ) {
    throw new Error("Measurement is not a number, string, or array");
  }
  if (typeof body.time_precision !== "number") {
    throw new Error("Time precision is not a number");
  }

  let time: number | undefined;
  if (body.time === undefined) {
    time = undefined;
  } else if (typeof body.time === "number") {
    time = body.time;
  } else {
    throw new Error("Timestamp is not a number");
  }

  if (!("type" in body.vdaf)) {
    throw new Error("VDAF type is missing");
  }

  const vdaf = body.vdaf as {
    type: unknown;
    bits?: unknown;
    buckets?: unknown;
  };

  if (typeof vdaf.type !== "string") {
    throw new Error("VDAF type is not a string");
  }

  let vdafObject: VdafObject;
  let measurement: Measurement;

  switch (vdaf.type) {
    case "Prio3Count":
      measurement = Number(body.measurement);
      if (measurement !== 0 && measurement !== 1) {
        throw new Error("Measurement is not 0 or 1");
      }

      vdafObject = {
        type: vdaf.type,
      };
      break;

    case "Prio3Sum":
      {
        let bits;
        if (!("bits" in vdaf)) {
          throw new Error("VDAF definition is missing number of bits");
        }
        if (typeof vdaf.bits === "number") {
          bits = vdaf.bits;
        } else if (typeof vdaf.bits == "string") {
          bits = parseInt(vdaf.bits, 10);
          if (isNaN(bits)) {
            throw new Error(
              "VDAF definition's `bits` parameter is not a valid base 10 integer",
            );
          }
        } else {
          throw new Error(
            "VDAF definition's `bits` parameter is not a number or string",
          );
        }
        if (typeof body.measurement !== "string") {
          throw new Error("Measurement is not a string");
        }

        vdafObject = {
          type: vdaf.type,
          bits: bits,
        };
        measurement = body.measurement;
      }
      break;

    case "Prio3Histogram":
      if (!("buckets" in vdaf)) {
        throw new Error("VDAF definition is missing buckets");
      }
      if (!Array.isArray(vdaf.buckets)) {
        throw new Error(
          "VDAF definition's `buckets` parameter is not an array",
        );
      }
      for (const bucketBoundary of vdaf.buckets) {
        if (typeof bucketBoundary !== "string") {
          throw new Error(
            "VDAF defeinition's `buckets` parameter is not an array of strings",
          );
        }
      }
      if (typeof body.measurement !== "string") {
        throw new Error("Measurement is not a string");
      }

      vdafObject = {
        type: vdaf.type,
        buckets: vdaf.buckets as string[],
      };
      measurement = body.measurement;
      break;

    default:
      throw new Error(`Unrecognized VDAF ${vdaf.type}`);
  }

  return {
    task_id: body.task_id,
    leader: body.leader,
    helper: body.helper,
    vdaf: vdafObject,
    measurement: measurement,
    time: time,
    time_precision: body.time_precision,
  };
}

function assertUnreachable(_: never): never {
  throw new Error("Unreachable code");
}

async function uploadHandler(req: Request, res: Response): Promise<void> {
  let body: UploadRequest;
  try {
    body = sanitizeRequest(req.body);
  } catch (error) {
    console.error(error);
    res.status(400).send({ status: "error", error: String(error) });
    return;
  }

  const options: ReportOptions = {};
  if (body.time !== undefined) {
    options.timestamp = new Date(body.time);
  }

  try {
    switch (body.vdaf.type) {
      case "Prio3Count":
        await new Task({
          id: body.task_id,
          leader: body.leader,
          helper: body.helper,
          timePrecisionSeconds: body.time_precision,
          type: "count",
        }).sendMeasurement(body.measurement !== 0, options);
        break;

      case "Prio3Sum":
        await new Task({
          id: body.task_id,
          leader: body.leader,
          helper: body.helper,
          timePrecisionSeconds: body.time_precision,
          type: "sum",
          bits: body.vdaf.bits,
        }).sendMeasurement(BigInt(body.measurement as string), options);
        break;

      case "Prio3Histogram":
        await new Task({
          id: body.task_id,
          leader: body.leader,
          helper: body.helper,
          timePrecisionSeconds: body.time_precision,
          type: "histogram",
          buckets: body.vdaf.buckets.map(Number),
        }).sendMeasurement(Number(body.measurement), options);
        break;

      default:
        assertUnreachable(body.vdaf);
    }
    console.log("Successful upload");
    res.send({ status: "success" });
  } catch (error) {
    console.log("Failed upload", error);
    // Send this with status 200 OK, as the error came from the DAP level,
    // not the test API level.
    res.send({ status: "error", error: String(error) });
  }
}

export function app(): express.Express {
  const app = express();
  app.use(express.json());

  app.post("/internal/test/ready", (_req, res) => {
    res.send({});
  });

  app.post("/internal/test/upload", (req, res, next) => {
    uploadHandler(req, res).catch(next);
  });

  return app;
}

function run() {
  console.debug("Starting server on port 8080");
  app().listen(8080);
}
