import { DAPError } from "./errors.js";
import assert from "assert";

describe("DAPError", () => {
  const sampleProblem = {
    type: "urn:ietf:params:ppm:error:unrecognizedTask",
    title: "An endpoint received a message with an unknown task ID.",
    detail:
      "For some reason the janus server sends the same content for detail as title",
    status: 400,
    instance: "..",
    taskid: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
  };

  context("fromResponse", () => {
    it("can be constructed from a problem json response", async () => {
      const error = await DAPError.fromResponse(
        new Response(JSON.stringify(sampleProblem), {
          headers: { "Content-Type": "application/problem+json" },
        }),
        "client context",
      );

      assert(error instanceof DAPError);
      assert.equal(error.type, "urn:ietf:params:ppm:error:unrecognizedTask");
      assert.equal(error.clientContext, "client context");
      assert.equal(error.title, sampleProblem.title);
      assert.equal(error.shortType, "unrecognizedTask");
      assert.equal(error.detail, sampleProblem.detail);
      assert.equal(
        error.message,
        "unrecognizedTask: An endpoint received a message with an unknown task ID.",
      );
      assert.equal(error.status, 400);
      assert.equal(error.instance, "..");
      assert.equal(error.taskId.toString(), sampleProblem.taskid);
    });

    it("returns a normal Error with the client context when the response isn't problem json", async () => {
      const error = await DAPError.fromResponse(
        new Response("doesn't matter"),
        "client context",
      );

      assert(!(error instanceof DAPError));
      assert.equal(error.message, "client context");
    });
  });
});
