import { DAPClient } from "dap/client";
import { Prio3Aes128Count } from "prio3/instantiations";

async function main() {
  await new DAPClient({
    vdaf: new Prio3Aes128Count({ shares: 2 }),
    taskId: process.argv[2],
    leader: "http://localhost:8080",
    helpers: ["http://localhost:8081"],
  }).sendMeasurement(true);
}

main().then().catch(console.error);
