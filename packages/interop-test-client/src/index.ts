// This script implements the client role of draft-dcook-ppm-dap-interop-test-design-02.

/* eslint no-console: "off" */

import type { Request, Response } from "express";
import express from "express";
import type { ReportOptions } from "@divviup/dap";
import Task from "@divviup/dap";

import { inspect } from "node:util";
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
  length: number;
  chunk_length: number;
}

interface SumVecVdafObject {
  type: "Prio3SumVec";
  length: number;
  chunk_length: number;
  bits: number;
}

type VdafObject =
  | CountVdafObject
  | SumVdafObject
  | HistogramVdafObject
  | SumVecVdafObject;

type Measurement = number | number[] | string | string[];

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
      measurement = fetchNumber(body, "measurement");
      if (measurement !== 0 && measurement !== 1) {
        throw new Error("Measurement is not 0 or 1");
      }

      vdafObject = {
        type: vdaf.type,
      };
      break;

    case "Prio3Sum":
      vdafObject = {
        type: vdaf.type,
        bits: fetchNumber(vdaf, "bits"),
      };
      measurement = fetchNumber(body, "measurement");
      break;

    case "Prio3Histogram":
      vdafObject = {
        type: vdaf.type,
        length: fetchNumber(vdaf, "length"),
        chunk_length: fetchNumber(vdaf, "chunk_length"),
      };
      measurement = fetchNumber(body, "measurement");
      break;

    case "Prio3SumVec":
      vdafObject = {
        type: vdaf.type,
        length: fetchNumber(vdaf, "length"),
        chunk_length: fetchNumber(vdaf, "chunk_length"),
        bits: fetchNumber(vdaf, "bits"),
      };
      measurement = (body.measurement as unknown[]).map((n) =>
        parseNumber(n, "measurement"),
      );
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

function fetchProperty(
  obj: { [key: string]: unknown },
  property: string,
): unknown {
  if (!(property in obj)) {
    throw new Error(`missing property ${property} from ${inspect(obj)}`);
  }
  return obj[property];
}

function fetchNumber(
  obj: { [key: string]: unknown },
  property: string,
): number {
  return parseNumber(fetchProperty(obj, property), property);
}

function parseNumber(input: unknown, name: string): number {
  if (typeof input === "number") {
    return input;
  } else if (typeof input == "string") {
    const returnValue = parseInt(input, 10);
    if (isNaN(returnValue)) {
      throw new Error(
        `${name} is not a valid base 10 integer (was ${inspect(input)})`,
      );
    }
    return returnValue;
  } else
    throw new Error(
      `${name} is not a valid base 10 integer (was ${inspect(input)})`,
    );
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
        }).sendMeasurement(body.measurement as number, options);
        break;

      case "Prio3Histogram":
        await new Task({
          id: body.task_id,
          leader: body.leader,
          helper: body.helper,
          timePrecisionSeconds: body.time_precision,
          type: "histogram",
          length: body.vdaf.length,
          chunkLength: body.vdaf.chunk_length,
        }).sendMeasurement(body.measurement as number, options);
        break;

      case "Prio3SumVec":
        await new Task({
          id: body.task_id,
          leader: body.leader,
          helper: body.helper,
          timePrecisionSeconds: body.time_precision,
          type: "sumVec",
          bits: body.vdaf.bits,
          length: body.vdaf.length,
          chunkLength: body.vdaf.chunk_length,
        }).sendMeasurement(body.measurement as number[], options);
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
