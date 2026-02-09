import type { SecurityOptions } from "./security";

/**
 * Configuration options for the infra plugin
 */
export interface InfraOptions {
	/**
	 * Your Better Auth project ID
	 * @default process.env.BETTER_AUTH_PROJECT_ID
	 */
	projectId?: string;

	/**
	 * The URL of the Better Auth Infra API
	 * @default "https://dash.better-auth.com"
	 */
	apiUrl?: string;

	/**
	 * The URL of the KV storage service
	 * @default "https://kv.better-auth.com"
	 */
	kvUrl?: string;

	/**
	 * Your Better Auth Infra API key
	 * @default process.env.BETTER_AUTH_API_KEY
	 */
	apiKey?: string;

	/**
	 * Security features configuration
	 */
	security?: SecurityOptions;

	/**
	 * User activity tracking configuration
	 */
	activityTracking?: {
		/**
		 * Interval in milliseconds to update lastActiveAt for active users
		 * Set to 0 to disable interval-based tracking
		 * @default 300000 (5 minutes)
		 */
		updateInterval?: number;
	};
}

/**
 * Internal options with required fields resolved
 * @internal
 */
export interface InfraOptionsInternal extends InfraOptions {
	apiUrl: string;
	kvUrl: string;
	apiKey: string;
}

// Keep DashOptions as an alias for backward compatibility
export type DashOptions = InfraOptions;
export type DashOptionsInternal = InfraOptionsInternal;

// Re-export types from better-call to help TypeScript resolve them during declaration file generation
export type { APIError, Endpoint, EndpointOptions } from "better-call";
// Re-export security types for convenience
export type { SecurityOptions } from "./security";
