export * from "./vanilla";
export * from "./query";
export * from "./types";
export { getClientConfig } from "./config";
export { createDynamicPathProxy } from "./proxy";
export { parseJSON } from "./parser";
export { capitalizeFirstLetter } from "./utils/misc";
export { BASE_ERROR_CODES } from "./types";
export type { InferRoutes } from "./path-to-object";

// Re-export types from dependencies
export type * from "nanostores";
export type * from "@better-fetch/fetch";
