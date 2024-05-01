/**
   The protocol version for this DAP implementation. Usually of the
   form `dap-{nn}`.
*/
export const DAP_VERSION = Object.freeze("dap-09");

export const CONTENT_TYPES = Object.freeze({
  REPORT: "application/dap-report",
  HPKE_CONFIG_LIST: "application/dap-hpke-config-list",
});

export enum Role {
  Collector = 0,
  Client = 1,
  Leader = 2,
  Helper = 3,
}
