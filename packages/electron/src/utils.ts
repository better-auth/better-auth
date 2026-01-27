import type { ElectronClientOptions } from "./types/client";

export function isProcessType(type: typeof process.type) {
  return typeof process !== "undefined" && process.type === type;
}

export function parseProtocolScheme(
  protocolOption: ElectronClientOptions["protocol"],
) {
  if (typeof protocolOption === "string") {
    return {
      scheme: protocolOption,
      privileges: {},
    };
  }

  return {
    scheme: protocolOption.scheme,
    privileges: protocolOption.privileges || {},
  };
}
