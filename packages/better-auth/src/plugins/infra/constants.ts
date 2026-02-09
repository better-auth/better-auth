/**
 * Infrastructure API URL
 * Can be overridden via plugin config or BETTER_AUTH_API_URL env var for local development
 */
export const DASH_API_URL =
	process.env.BETTER_AUTH_API_URL || "https://dash.better-auth.com";

/**
 * KV Storage URL
 * Can be overridden via plugin config or BETTER_AUTH_KV_URL env var for local development
 */
export const DASH_KV_URL =
	process.env.BETTER_AUTH_KV_URL || "https://kv.better-auth.com";
