# [DivviUp](https://divviup.org/) Typescript Client


[![Coverage Status](https://coveralls.io/repos/github/divviup/divviup-ts/badge.svg?branch=main)](https://coveralls.io/github/divviup/divviup-ts?branch=main)
[![CI](https://github.com/divviup/divviup-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/divviup/divviup-ts/actions/workflows/ci.yaml)

[docs for main](https://divviup.github.io/divviup-ts/)

```typescript
import { DAPClient } from "dap/client";
import { Prio3Aes128Sum } from "prio3/instantiations";

const client = new DAPClient({
  vdaf: new Prio3Aes128Sum({ shares: 2, bits: 8 }),
  taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
  leader: "http://localhost:8080",
  helpers: ["http://localhost:8081"],
});

await client.sendMeasurement(42, null);
```
