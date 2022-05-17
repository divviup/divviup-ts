# DivvyUp Typescript Client

```typescript
import { DAPClient } from "dap/client";
import { Prio3Aes128Count } from "prio3";

const client = new DAPClient({
  vdaf: new Prio3Aes128Count(2),
  taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
  leader: "http://localhost:8080",
  helpers: ["http://localhost:8081"],
});

await client.fetchKeyConfiguration();
const report = await client.generateReport(1, null);
await client.sendReport(report);
```
