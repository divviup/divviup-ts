# [DivviUp](https://divviup.org/) Typescript Client

[![Coverage Status](https://coveralls.io/repos/github/divviup/divviup-ts/badge.svg?branch=main)](https://coveralls.io/github/divviup/divviup-ts?branch=main)
[![CI](https://github.com/divviup/divviup-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/divviup/divviup-ts/actions/workflows/ci.yaml)

[docs for main](https://divviup.github.io/divviup-ts/)

## Protocol Versions and Release Branches

The `main` branch is under continuous development and will usually be partway between DAP and VDAF drafts. divviup-ts uses stable release branches to maintain implementations of different draft versions. Artifacts for some draft version are published from a corresponding `release/dap-draft-xy` branch. Only supported release branches receive dependency updates and backports.

| Git branch | Draft version | Conforms to specification? | Status |
| ---------- | ------------- | -------------------------- | ------ |
| `release/dap-draft-02` | [`draft-ietf-ppm-dap-02`][dap-02] | Yes | Unmaintained |
| `release/dap-draft-03` | [`draft-ietf-ppm-dap-03`][dap-03] | Yes | Unmaintained as of May 22, 2023 |
| `release/dap-draft-04` | [`draft-ietf-ppm-dap-04`][dap-04] | Yes | Supported |
| `main` | [`draft-ietf-ppm-dap-07`][dap-07] | [Partially][dap-07-issue] | Supported |

[dap-02]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/02/
[dap-03]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/03/
[dap-04]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/04/
[dap-07]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/07/
[dap-07-issue]: https://github.com/divviup/divviup-ts/issues/359

## Usage

```typescript
import Task from "@divviup/dap";

const task = new Task({
  type: "sum",
  bits: 8,
  id: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
  leader: "http://localhost:8080",
  helper: "http://localhost:8081",
  timePrecisionSeconds: 3600,
});

await task.sendMeasurement(42);
```
