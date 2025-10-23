//#region Re-exports necessaries from core module
export * from "@better-auth/core/env";
export * from "@better-auth/core";
export * from "@better-auth/core/oauth2";
export * from "@better-auth/core/error";
export * from "@better-auth/core/utils";
//#endregion
export { getCurrentAdapter } from "@better-auth/core/context";
export * from "./auth";
export * from "./types";
export * from "./utils";
// export this as we are referencing OAuth2Tokens in the `refresh-token` api as return type

// telemetry exports for CLI and consumers
export {
	createTelemetry,
	getTelemetryAuthConfig,
	type TelemetryEvent,
} from "@better-auth/telemetry";
export { APIError } from "./api";
