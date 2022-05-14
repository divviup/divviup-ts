# DivvyUp Typescript Client

```typescript
import { DAPClient } from "dap/client";
import { Prio3Aes128Count } from "prio3";

async function main() {
  const client = new DAPClient({
    vdaf: new Prio3Aes128Count(2),
    aggregators: [
      { url: "http://localhost:8080", role: "leader" },
      { url: "http://localhost:8081", role: "helper" },
    ],
    minimumBatchSize: 1,
    taskId: Buffer.from(process.argv[2], "base64url"),
  });

  await client.fetchKeyConfiguration();
  const report = await client.generateReport(1, null);
  await client.sendReport(report);
}

main().then().catch(console.error);
```
