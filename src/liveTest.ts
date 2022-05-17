import { DAPClient } from "dap/client";
import { Prio3Aes128Count } from "prio3";

async function main() {
  const client = new DAPClient({
    vdaf: new Prio3Aes128Count(2),
    taskId: process.argv[2],
    leader: "http://localhost:8080",
    helpers: ["http://localhost:8081"],
  });

  await client.fetchKeyConfiguration();
  const report = await client.generateReport(1, null);
  await client.sendReport(report);
}

main().then().catch(console.error);
