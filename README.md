# [DivviUp](https://divviup.org/) Typescript Client

[![Coverage Status](https://coveralls.io/repos/github/divviup/divviup-ts/badge.svg?branch=main)](https://coveralls.io/github/divviup/divviup-ts?branch=main)
[![CI](https://github.com/divviup/divviup-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/divviup/divviup-ts/actions/workflows/ci.yaml)

[docs for main](https://divviup.github.io/divviup-ts/)

## Protocol Versions and Release Branches

The `main` branch is under continuous development and will usually be partway between DAP and VDAF
drafts. divviup-ts uses stable release branches to maintain implementations of different draft
versions. Artifacts for some draft version are published from a corresponding `release/dap-draft-xy`
branch. Only supported release branches receive dependency updates and backports.

### DAP

| Package version                     | Git branch                          | Protocol version                  | Conforms to specification? | Status                          |
| ----------------------------------- | ----------------------------------- | --------------------------------- | -------------------------- | ------------------------------- |
| N/A                                 | [`release-dap-draft-02`][branch-02] | [`draft-ietf-ppm-dap-02`][dap-02] | Yes                        | Unmaintained                    |
| N/A                                 | [`release-dap-draft-03`][branch-03] | [`draft-ietf-ppm-dap-03`][dap-03] | Yes                        | Unmaintained as of May 22, 2023 |
| [`@divviup/dap@0.1`][npm-dap-0.1.0] | [`release-dap-draft-04`][branch-04] | [`draft-ietf-ppm-dap-04`][dap-04] | Yes                        | Unmaintained as of June 24, 2024 |
| [`@divviup/dap@0.7`][npm-dap-0.7.0] | [`release-dap-draft-07`][branch-07] | [`draft-ietf-ppm-dap-07`][dap-07] | Yes                        | Unmaintained as of June 24, 2024 |
| [`@divviup/dap@0.9`][npm-dap-0.9.0] | [`main`][main]                      | [`draft-ietf-ppm-dap-09`][dap-09] | Yes                        | Supported                       |

### VDAF and Prio3

| VDAF Package                          | Prio3 Package                           | Git branch                          | Protocol version                     | Conforms to specification? | Status                          |
| ------------------------------------- | --------------------------------------- | ----------------------------------- | ------------------------------------ | -------------------------- | ------------------------------- |
| N/A                                   | N/A                                     | [`release/dap-draft-03`][branch-03] | [`draft-irtf-cfrg-vdaf-03`][vdaf-03] | Yes                        | Unmaintained as of May 22, 2023 |
| [`@divviup/vdaf@0.1`][npm-vdaf-0.1.0] | [`@divviup/prio3@0.1`][npm-prio3-0.1.0] | [`release/dap-draft-04`][branch-04] | [`draft-irtf-cfrg-vdaf-05`][vdaf-05] | Yes                        | Unmaintained as of June 24, 2024 |
| [`@divviup/vdaf@0.7`][npm-vdaf-0.7.0] | [`@divviup/prio3@0.7`][npm-prio3-0.7.0] | [`release/dap-draft-07`][branch-07] | [`draft-irtf-cfrg-vdaf-07`][vdaf-07] | Yes                        | Unmaintained as of June 24, 2024 |
| [`@divviup/vdaf@0.8`][npm-vdaf-0.8.0] | [`@divviup/prio3@0.8`][npm-prio3-0.8.0] | [`main`][main]                      | [`draft-irtf-cfrg-vdaf-08`][vdaf-08] | Yes                        | Supported                       |

## Bundling into an npm application

```
$ npm add @divviup/dap
```

```typescript
import Task from "@divviup/dap";

const task = new Task({
  type: "sum",
  bits: 8,
  id: "3XTBHxTtUAtI516GeXZsVIKjBPYVNIYmF94vEBb4jcY",
  leader: "https://dap.api.divviup.org",
  helper: "https://dap.example.com",
  timePrecisionSeconds: 3600,
});

await task.sendMeasurement(42);
```

## CDN URLs

DivviUp publishes bundled and minified builds suitable for use from a script tag. `Task` will be available on globalThis as `divviup.dap.Task`.

### [JsDelivr](https://www.jsdelivr.com/)
```html
<script
    src="https://cdn.jsdelivr.net/npm/@divviup/dap@0.7.0/dist/browser.js"
    crossorigin="anonymous"
    integrity="sha384-vDbUcIcXsbrWLhKwkF/wwM0cnW+5y9fiPA695EnPd58okNZwWuLsR0NF98zzyNkT">
</script>
```

### [UNPKG](https://unpkg.com/)
```html
<script
    src="https://unpkg.com/@divviup/dap@0.7.0/dist/browser.js"
    crossorigin="anonymous"
    integrity="sha384-vDbUcIcXsbrWLhKwkF/wwM0cnW+5y9fiPA695EnPd58okNZwWuLsR0NF98zzyNkT">
</script>
```


[npm-vdaf-0.1.0]: https://www.npmjs.com/package/@divviup/vdaf/v/0.1.0
[npm-vdaf-0.7.0]: https://www.npmjs.com/package/@divviup/vdaf/v/0.7.0
[npm-vdaf-0.8.0]: https://www.npmjs.com/package/@divviup/vdaf/v/0.8.0
[npm-prio3-0.1.0]: https://www.npmjs.com/package/@divviup/prio3/v/0.1.0
[npm-prio3-0.7.0]: https://www.npmjs.com/package/@divviup/prio3/v/0.7.0
[npm-prio3-0.8.0]: https://www.npmjs.com/package/@divviup/prio3/v/0.8.0
[npm-dap-0.1.0]: https://www.npmjs.com/package/@divviup/dap/v/0.1.0
[npm-dap-0.7.0]: https://www.npmjs.com/package/@divviup/dap/v/0.7.0
[npm-dap-0.9.0]: https://www.npmjs.com/package/@divviup/dap/v/0.9.0
[vdaf-03]: https://datatracker.ietf.org/doc/draft-irtf-cfrg-vdaf/03/
[vdaf-05]: https://datatracker.ietf.org/doc/draft-irtf-cfrg-vdaf/05/
[vdaf-07]: https://datatracker.ietf.org/doc/draft-irtf-cfrg-vdaf/07/
[vdaf-08]: https://datatracker.ietf.org/doc/draft-irtf-cfrg-vdaf/08/
[dap-02]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/02/
[dap-03]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/03/
[dap-04]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/04/
[dap-07]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/07/
[dap-09]: https://datatracker.ietf.org/doc/draft-ietf-ppm-dap/09/
[branch-02]: https://github.com/divviup/divviup-ts/tree/release/dap-draft-02
[branch-03]: https://github.com/divviup/divviup-ts/tree/release/dap-draft-03
[branch-04]: https://github.com/divviup/divviup-ts/tree/release/dap-draft-04
[branch-07]: https://github.com/divviup/divviup-ts/tree/release/dap-draft-07
[main]: https://github.com/divviup/divviup-ts/tree/main
