import { TaskId } from "dap/taskId";
import assert from "assert";

describe("TaskId", () => {
  it("requires exactly 32 bytes", () => {
    assert.throws(() => new TaskId(Buffer.from("hello")));
    assert.throws(() => new TaskId(Buffer.alloc(31)));
    assert.throws(() => new TaskId(Buffer.alloc(33)));
    assert.doesNotThrow(() => new TaskId(Buffer.alloc(32)));
  });

  it("generates a random TaskId", () => {
    if (process.env.TEST_VECTOR) {
      assert.equal(
        TaskId.random().toString(),
        "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"
      );
    } else {
      // this is a weak test but it's probably fine because the code is simple
      const taskId = TaskId.random();
      const otherTaskId = TaskId.random();
      assert.notEqual(taskId.toString(), otherTaskId.toString());
    }
  });

  it("stringifies as the base64url representation", () => {
    const taskId = new TaskId(
      Buffer.from(
        "dd74c11f14ed500b48e75e8679766c5482a304f61534862617de2f1016f88dc6",
        "hex"
      )
    );
    assert.equal(taskId, "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY");
  });
});
