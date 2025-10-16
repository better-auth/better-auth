//#region Re-exports necessaries from core module
export * from "@better-auth/core/env";
export * from "@better-auth/core";
export * from "@better-auth/core/oauth2";
export * from "@better-auth/core/error";
export * from "@better-auth/core/utils";
//#endregion
export { getCurrentAdapter } from "./context/transaction";
export * from "./auth";
export * from "./types";
export * from "./utils";
export type * from "better-call";
export type * from "zod/v4";
// @ts-expect-error we need to export core to make sure type annotations works with v4/core
export type * from "zod/v4/core";
//@ts-expect-error: we need to export helper types even when they conflict with better-call types to avoid "The inferred type of 'auth' cannot be named without a reference to..."
export type * from "./types/helper";
// export this as we are referencing OAuth2Tokens in the `refresh-token` api as return type

// telemetry exports for CLI and consumers
export {
	createTelemetry,
	getTelemetryAuthConfig,
	type TelemetryEvent,
} from "@better-auth/telemetry";
export { APIError } from "./api";
