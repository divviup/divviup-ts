# DivvyUp Typescript Client

```typescript
import { DAPClient, Role } from "dap/client";
import { Prio3Aes128Count } from "prio3";
import { TaskId } from "dap/taskId";

async function main() {
  const client = new DAPClient({
    vdaf: new Prio3Aes128Count(2),
    aggregators: [
      {
        url: new URL("http://localhost:8080"),
        role: Role.Leader,
      },
      {
        url: new URL("http://localhost:8081"),
        role: Role.Helper,
      },
    ],
    minimumBatchSize: 1,
    taskId: new TaskId(Buffer.from(process.argv[2], "base64url")),
  });

  await client.fetchKeyConfiguration();
  const report = await client.generateReport(1, null);
  await client.sendReport(report);
}

main().then().catch(console.error);
```
