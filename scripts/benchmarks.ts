import Benchmark from "benchmark";
import { DAPClient, KnownVdafSpec, VdafMeasurement } from "dap/client";
import { TaskId } from "dap/taskId";
import { HpkeConfig } from "dap/hpkeConfig";
import * as hpke from "hpke";

const suite = new Benchmark.Suite("Report generation");
function buildHpkeConfig(): HpkeConfig {
  return new HpkeConfig(
    1,
    hpke.Kem.DhP256HkdfSha256,
    hpke.Kdf.Sha256,
    hpke.Aead.AesGcm128,
    Buffer.from(new hpke.Keypair(hpke.Kem.DhP256HkdfSha256).public_key)
  );
}

function withHpkeConfigs<
  Spec extends KnownVdafSpec,
  Measurement extends VdafMeasurement<Spec>
>(dapClient: DAPClient<Spec, Measurement>): DAPClient<Spec, Measurement> {
  for (const aggregator of dapClient.aggregators) {
    aggregator.hpkeConfig = buildHpkeConfig();
  }
  return dapClient;
}

function buildClient<
  Spec extends KnownVdafSpec,
  Measurement extends VdafMeasurement<Spec>
>(spec: Spec): DAPClient<Spec, Measurement> {
  return withHpkeConfigs(
    new DAPClient({
      helper: "http://helper.example.com",
      leader: "http://leader.example.com",
      taskId: TaskId.random(),
      ...spec,
    })
  );
}

const sumClient = buildClient({ type: "sum", bits: 8 });
const histogramClient = buildClient({
  type: "histogram",
  buckets: [10, 20, 30],
});
const countClient = buildClient({ type: "count" });

suite.add("sum", async () => {
  const report = await sumClient.generateReport(
    Math.floor(Math.random() * 100)
  );
  report.encode();
});

suite.add("histogram", async () => {
  const report = await histogramClient.generateReport(
    Math.floor(Math.random() * 50)
  );
  report.encode();
});

suite.add("count", async () => {
  const report = await countClient.generateReport(Math.random() < 0.5);
  report.encode();
});

suite.on("cycle", (event: Benchmark.Event) => {
  console.log(String(event.target));
  console.log(event.target.stats);
});

suite.run({ async: true });
