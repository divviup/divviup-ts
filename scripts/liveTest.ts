import DAPClient from "dap";
async function main() {
  const client = new DAPClient({
    taskId: process.argv[2],
    leader: "http://localhost:8080",
    helper: "http://localhost:8081",
    type: "histogram",
    buckets: [10, 20, 30],
    timePrecisionSeconds: 8 * 3600,
  });

  await client.sendMeasurement(1);
}

main().then().catch(console.error);
