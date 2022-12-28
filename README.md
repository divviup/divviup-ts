# [DivviUp](https://divviup.org/) Typescript Client

[![Coverage Status](https://coveralls.io/repos/github/divviup/divviup-ts/badge.svg?branch=main)](https://coveralls.io/github/divviup/divviup-ts?branch=main)
[![CI](https://github.com/divviup/divviup-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/divviup/divviup-ts/actions/workflows/ci.yaml)

[docs for main](https://divviup.github.io/divviup-ts/)

## Protocol Versions

This repository is current to [version DAP-03](https://www.ietf.org/archive/id/draft-ietf-ppm-dap-03.html) and [version VDAF-03](https://www.ietf.org/archive/id/draft-irtf-cfrg-vdaf-03.html)

## Usage

```typescript
import DAPClient from "@divviup/dap";

const client = new DAPClient({
  type: "sum",
  bits: 8,
  taskId: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
  leader: "http://localhost:8080",
  helper: "http://localhost:8081",
  timePrecisionSeconds: 3600,
});

await client.sendMeasurement(42);
```
