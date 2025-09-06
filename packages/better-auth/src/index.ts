export * from "./auth";
export * from "./types";
export * from "./error";
export * from "./utils";
export type * from "better-call";
export type * from "zod/v4";
// @ts-expect-error we need to export core to make sure type annotations works with v4/core
export type * from "zod/v4/core";
//@ts-expect-error: we need to export helper types even when they conflict with better-call types to avoid "The inferred type of 'auth' cannot be named without a reference to..."
export type * from "./types/helper";
// export this as we are referencing OAuth2Tokens in the `refresh-token` api as return type
export type * from "./oauth2/types";

// telemetry exports for CLI and consumers
export { createTelemetry } from "./telemetry";
export { getTelemetryAuthConfig } from "./telemetry/detectors/detect-auth-config";
export type { TelemetryEvent } from "./telemetry/types";
export { APIError } from "./api";
