# [DivviUp](https://divviup.org/) Typescript Client


[![Coverage Status](https://coveralls.io/repos/github/jbr/divviup-ts/badge.svg?branch=main)](https://coveralls.io/github/jbr/divviup-ts?branch=main)
[![CI](https://github.com/jbr/divviup-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/jbr/divviup-ts/actions/workflows/ci.yaml)

[docs for main](https://jbr.github.io/divviup-ts/)

```typescript
import { DAPClient } from "dap/client";
import { Prio3Aes128Count } from "prio3/instantiations";

const client = new DAPClient({
  vdaf: new Prio3Aes128Count({ shares: 2 }),
  taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
  leader: "http://localhost:8080",
  helpers: ["http://localhost:8081"],
});

await client.sendMeasurement(1, null);
```
