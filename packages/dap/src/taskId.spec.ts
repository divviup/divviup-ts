import { TaskId } from "./taskId.js";
import assert from "assert";

describe("DAP TaskId", () => {
  it("requires exactly 32 bytes", () => {
    assert.throws(() => new TaskId(Buffer.from("hello")));
    assert.throws(() => new TaskId(Buffer.alloc(31)));
    assert.throws(() => new TaskId(Buffer.alloc(33)));
    assert.doesNotThrow(() => new TaskId(Buffer.alloc(32)));
  });

  it("generates a random TaskId", () => {
    // this is a weak test but it's probably fine because the code is simple
    const id = TaskId.random();
    const otherTaskId = TaskId.random();
    assert.notEqual(id.toString(), otherTaskId.toString());
  });

  it("stringifies as the base64url representation", () => {
    const id = new TaskId(
      Buffer.from(
        "dd74c11f14ed500b48e75e8679766c5482a304f61534862617de2f1016f88dc6",
        "hex",
      ),
    );
    assert.equal(id, "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY");
  });
});
