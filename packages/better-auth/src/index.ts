//#region Re-exports necessaries from core module
export type { StandardSchemaV1 } from "@better-auth/core";
export * from "@better-auth/core";
export { getCurrentAdapter } from "@better-auth/core/context";
export * from "@better-auth/core/db";
export * from "@better-auth/core/env";
export * from "@better-auth/core/error";
export * from "@better-auth/core/oauth2";
export * from "@better-auth/core/utils";
//#endregion
export * from "./auth";
// @ts-expect-error
export * from "./types";
export * from "./utils";
// export this as we are referencing OAuth2Tokens in the `refresh-token` api as return type

// telemetry exports for CLI and consumers
export {
	createTelemetry,
	getTelemetryAuthConfig,
	type TelemetryEvent,
} from "@better-auth/telemetry";
// re-export third party types
// @ts-expect-error
export type * from "better-call";
export type { JSONWebKeySet, JWTPayload } from "jose";
export type * from "zod";
export type * from "zod/v4";
// @ts-expect-error
export type * from "zod/v4/core";
export { APIError } from "./api";
