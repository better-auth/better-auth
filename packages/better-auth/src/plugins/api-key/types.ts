import type {
	GenericEndpointContext,
	HookEndpointContext,
} from "@better-auth/core";
import type { InferOptionSchema } from "../../types";
import type { Statements } from "../access";
import type { apiKeySchema } from "./schema";
export interface ApiKeyOptions {
	/**
	 * The header name to check for API key
	 * @default "x-api-key"
	 */
	apiKeyHeaders?: (string | string[]) | undefined;
	/**
	 * Disable hashing of the API key.
	 *
	 * ⚠️ Security Warning: It's strongly recommended to not disable hashing.
	 * Storing API keys in plaintext makes them vulnerable to database breaches, potentially exposing all your users' API keys.
	 *
	 * @default false
	 */
	disableKeyHashing?: boolean | undefined;
	/**
	 * The function to get the API key from the context
	 */
	customAPIKeyGetter?:
		| ((ctx: HookEndpointContext) => string | null)
		| undefined;
	/**
	 * A custom function to validate the API key
	 */
	customAPIKeyValidator?:
		| ((options: {
				ctx: GenericEndpointContext;
				key: string;
		  }) => boolean | Promise<boolean>)
		| undefined;
	/**
	 * custom key generation function
	 */
	customKeyGenerator?: (options: {
		/**
		 * The length of the API key to generate
		 */
		length: number;
		/**
		 * The prefix of the API key to generate
		 */
		prefix: string | undefined;
	}) => string | Promise<string>;
	/**
	 * The configuration for storing the starting characters of the API key in the database.
	 *
	 * Useful if you want to display the starting characters of an API key in the UI.
	 */
	startingCharactersConfig?:
		| {
				/**
				 * Whether to store the starting characters in the database. If false, we will set `start` to `null`.
				 *
				 * @default true
				 */
				shouldStore?: boolean;
				/**
				 * The length of the starting characters to store in the database.
				 *
				 * This includes the prefix length.
				 *
				 * @default 6
				 */
				charactersLength?: number;
		  }
		| undefined;
	/**
	 * The length of the API key. Longer is better. Default is 64. (Doesn't include the prefix length)
	 * @default 64
	 */
	defaultKeyLength?: number | undefined;
	/**
	 * The prefix of the API key.
	 *
	 * Note: We recommend you append an underscore to the prefix to make the prefix more identifiable. (eg `hello_`)
	 */
	defaultPrefix?: string | undefined;
	/**
	 * The maximum length of the prefix.
	 *
	 * @default 32
	 */
	maximumPrefixLength?: number | undefined;
	/**
	 * Whether to require a name for the API key.
	 *
	 * @default false
	 */
	requireName?: boolean | undefined;
	/**
	 * The minimum length of the prefix.
	 *
	 * @default 1
	 */
	minimumPrefixLength?: number | undefined;
	/**
	 * The maximum length of the name.
	 *
	 * @default 32
	 */
	maximumNameLength?: number | undefined;
	/**
	 * The minimum length of the name.
	 *
	 * @default 1
	 */
	minimumNameLength?: number | undefined;
	/**
	 * Whether to enable metadata for an API key.
	 *
	 * @default false
	 */
	enableMetadata?: boolean | undefined;
	/**
	 * Customize the key expiration.
	 */
	keyExpiration?:
		| {
				/**
				 * The default expires time in milliseconds.
				 *
				 * If `null`, then there will be no expiration time.
				 *
				 * @default null
				 */
				defaultExpiresIn?: number | null;
				/**
				 * Whether to disable the expires time passed from the client.
				 *
				 * If `true`, the expires time will be based on the default values.
				 *
				 * @default false
				 */
				disableCustomExpiresTime?: boolean;
				/**
				 * The minimum expiresIn value allowed to be set from the client. in days.
				 *
				 * @default 1
				 */
				minExpiresIn?: number;
				/**
				 * The maximum expiresIn value allowed to be set from the client. in days.
				 *
				 * @default 365
				 */
				maxExpiresIn?: number;
		  }
		| undefined;
	/**
	 * Default rate limiting options.
	 */
	rateLimit?:
		| {
				/**
				 * Whether to enable rate limiting.
				 *
				 * @default true
				 */
				enabled?: boolean;
				/**
				 * The duration in milliseconds where each request is counted.
				 *
				 * Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset.
				 *
				 * @default 1000 * 60 * 60 * 24 // 1 day
				 */
				timeWindow?: number;
				/**
				 * Maximum amount of requests allowed within a window
				 *
				 * Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset.
				 *
				 * @default 10 // 10 requests per day
				 */
				maxRequests?: number;
		  }
		| undefined;
	/**
	 * custom schema for the API key plugin
	 */
	schema?: InferOptionSchema<ReturnType<typeof apiKeySchema>> | undefined;
	/**
	 * An API Key can represent a valid session, so we automatically mock a session for the user if we find a valid API key in the request headers.
	 *
	 * ⚠︎ This is not recommended for production use, as it can lead to security issues.
	 * @default false
	 */
	enableSessionForAPIKeys?: boolean | undefined;
	/**
	 * Permissions for the API key.
	 */
	permissions?:
		| {
				/**
				 * The default permissions for the API key.
				 */
				defaultPermissions?:
					| Statements
					| ((
							userId: string,
							ctx: GenericEndpointContext,
					  ) => Statements | Promise<Statements>);
		  }
		| undefined;
	/**
	 * Storage backend for API keys.
	 *
	 * - `"database"`: Store API keys in the database adapter (default)
	 * - `"secondary-storage"`: Store API keys in the configured secondary storage (e.g., Redis)
	 *
	 * @default "database"
	 */
	storage?: "database" | "secondary-storage" | undefined;
	/**
	 * When `storage` is `"secondary-storage"`, enable fallback to database if key is not found in secondary storage.
	 *
	 * Useful for gradual migration from database to secondary storage.
	 *
	 * @default false
	 */
	fallbackToDatabase?: boolean | undefined;
	/**
	 * Custom storage methods for API keys.
	 *
	 * If provided, these methods will be used instead of `ctx.context.secondaryStorage`.
	 * Custom methods take precedence over global secondary storage.
	 *
	 * Useful when you want to use a different storage backend specifically for API keys,
	 * or when you need custom logic for storage operations.
	 */
	customStorage?:
		| {
				/**
				 * Get a value from storage
				 */
				get: (key: string) => Promise<unknown> | unknown;
				/**
				 * Set a value in storage
				 */
				set: (
					key: string,
					value: string,
					ttl?: number | undefined,
				) => Promise<void | null | unknown> | void;
				/**
				 * Delete a value from storage
				 */
				delete: (key: string) => Promise<void | null | string> | void;
		  }
		| undefined;
}

export type ApiKey = {
	/**
	 * ID
	 */
	id: string;
	/**
	 * The name of the key
	 */
	name: string | null;
	/**
	 * Shows the first few characters of the API key, including the prefix.
	 * This allows you to show those few characters in the UI to make it easier for users to identify the API key.
	 */
	start: string | null;
	/**
	 * The API Key prefix. Stored as plain text.
	 */
	prefix: string | null;
	/**
	 * The hashed API key value
	 */
	key: string;
	/**
	 * The owner of the user id
	 */
	userId: string;
	/**
	 * The interval in milliseconds between refills of the `remaining` count
	 *
	 * @example 3600000 // refill every hour (3600000ms = 1h)
	 */
	refillInterval: number | null;
	/**
	 * The amount to refill
	 */
	refillAmount: number | null;
	/**
	 * The last refill date
	 */
	lastRefillAt: Date | null;
	/**
	 * Sets if key is enabled or disabled
	 *
	 * @default true
	 */
	enabled: boolean;
	/**
	 * Whether the key has rate limiting enabled.
	 */
	rateLimitEnabled: boolean;
	/**
	 * The duration in milliseconds
	 */
	rateLimitTimeWindow: number | null;
	/**
	 * Maximum amount of requests allowed within a window
	 */
	rateLimitMax: number | null;
	/**
	 * The number of requests made within the rate limit time window
	 */
	requestCount: number;
	/**
	 * Remaining requests (every time API key is used this should updated and should be updated on refill as well)
	 */
	remaining: number | null;
	/**
	 * When last request occurred
	 */
	lastRequest: Date | null;
	/**
	 * Expiry date of a key
	 */
	expiresAt: Date | null;
	/**
	 * created at
	 */
	createdAt: Date;
	/**
	 * updated at
	 */
	updatedAt: Date;
	/**
	 * Extra metadata about the apiKey
	 */
	metadata: Record<string, any> | null;
	/**
	 * Permissions for the API key
	 */
	permissions?:
		| ({
				[key: string]: string[];
		  } | null)
		| undefined;
};
