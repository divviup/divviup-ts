import Benchmark from "benchmark";
import { DAPClient } from "dap/client";
import { TaskId } from "dap/taskId";
import {
  Prio3Aes128Count,
  Prio3Aes128Histogram,
  Prio3Aes128Sum,
} from "prio3/instantiations";
import { HpkeConfig } from "dap/hpkeConfig";
import { ClientVdaf } from "vdaf";
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

function withHpkeConfigs<M, PP>(dapClient: DAPClient<M, PP>): DAPClient<M, PP> {
  for (const aggregator of dapClient.aggregators) {
    aggregator.hpkeConfig = buildHpkeConfig();
  }
  return dapClient;
}

function buildClient<M, PP>(vdaf: ClientVdaf<M, PP>): DAPClient<M, PP> {
  return withHpkeConfigs(
    new DAPClient({
      helpers: ["http://helper.example.com"],
      leader: "http://leader.example.com",
      taskId: TaskId.random(),
      vdaf,
    })
  );
}

const sumClient = buildClient(new Prio3Aes128Sum({ bits: 8, shares: 2 }));
const histogramClient = buildClient(
  new Prio3Aes128Histogram({ shares: 2, buckets: [10, 20, 30] })
);
const countClient = buildClient(new Prio3Aes128Count({ shares: 2 }));

suite.add("sum", async () => {
  const report = await sumClient.generateReport(
    Math.floor(Math.random() * 100),
    null
  );
  report.encode();
});

suite.add("histogram", async () => {
  const report = await histogramClient.generateReport(
    Math.floor(Math.random() * 50),
    null
  );
  report.encode();
});

suite.add("count", async () => {
  const report = await countClient.generateReport(Math.random() < 0.5, null);
  report.encode();
});

suite.on("cycle", (event: Benchmark.Event) => {
  console.log(String(event.target));
  console.log(event.target.stats);
});

suite.run({ async: true });
