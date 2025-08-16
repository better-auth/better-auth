import type { z } from "zod";
import type { BetterAuthPlugin } from "../../types/plugins";

export interface M2MOptions {
	/**
	 * The header name to use for client secret
	 * @default "x-client-secret"
	 */
	clientSecretHeaders?: string;
	/**
	 * The default length for client secrets
	 * @default 64
	 */
	defaultClientSecretLength?: number;
	/**
	 * The maximum length for client names
	 * @default 100
	 */
	maximumClientNameLength?: number;
	/**
	 * The minimum length for client names
	 * @default 1
	 */
	minimumClientNameLength?: number;
	/**
	 * Enable metadata for M2M clients
	 * @default false
	 */
	enableMetadata?: boolean;
	/**
	 * Disable client secret hashing
	 * @default false
	 */
	disableClientSecretHashing?: boolean;
	/**
	 * Require client name when creating clients
	 * @default false
	 */
	requireClientName?: boolean;
	/**
	 * Rate limiting configuration
	 */
	rateLimit?: {
		/**
		 * Enable rate limiting
		 * @default true
		 */
		enabled?: boolean;
		/**
		 * Time window for rate limiting in milliseconds
		 * @default 24 hours
		 */
		timeWindow?: number;
		/**
		 * Maximum requests per time window
		 * @default 1000
		 */
		maxRequests?: number;
	};
	/**
	 * Client expiration configuration
	 */
	clientExpiration?: {
		/**
		 * Default expiration time in days
		 * @default null (no expiration)
		 */
		defaultExpiresIn?: number | null;
		/**
		 * Disable custom expiration times
		 * @default false
		 */
		disableCustomExpiresTime?: boolean;
		/**
		 * Maximum expiration time in days
		 * @default 365
		 */
		maxExpiresIn?: number;
		/**
		 * Minimum expiration time in days
		 * @default 1
		 */
		minExpiresIn?: number;
	};
	/**
	 * Starting characters configuration
	 */
	startingCharactersConfig?: {
		/**
		 * Store starting characters for display
		 * @default true
		 */
		shouldStore?: boolean;
		/**
		 * Number of characters to store
		 * @default 6
		 */
		charactersLength?: number;
	};
	/**
	 * Access token expiration time in seconds
	 * @default 3600 (1 hour)
	 */
	accessTokenExpiresIn?: number;
	/**
	 * Refresh token expiration time in seconds
	 * @default 2592000 (30 days)
	 */
	refreshTokenExpiresIn?: number;
	/**
	 * Custom schema to merge with the default schema
	 */
	schema?: z.ZodObject<any>;
}

export interface M2MClient {
	/**
	 * Unique identifier for the client
	 */
	id: string;
	/**
	 * Client ID used for authentication
	 */
	clientId: string;
	/**
	 * Hashed client secret
	 */
	clientSecret: string;
	/**
	 * Display name for the client
	 */
	name?: string;
	/**
	 * Whether the client is disabled
	 */
	disabled: boolean;
	/**
	 * When the client expires
	 */
	expiresAt?: Date;
	/**
	 * Scopes that this client can request
	 */
	scopes?: string[];
	/**
	 * Metadata for the client
	 */
	metadata?: Record<string, any>;
	/**
	 * Starting characters of the client secret for display
	 */
	startingCharacters?: string;
	/**
	 * When the client was created
	 */
	createdAt: Date;
	/**
	 * When the client was last updated
	 */
	updatedAt: Date;
}

export interface CreateM2MClientData {
	/**
	 * Display name for the client
	 */
	name?: string;
	/**
	 * Scopes that this client can request
	 */
	scopes?: string[];
	/**
	 * Metadata for the client
	 */
	metadata?: Record<string, any>;
	/**
	 * When the client expires (in days from now)
	 */
	expiresIn?: number;
}

export interface M2MPlugin extends BetterAuthPlugin {
	id: "m2m";
	options: M2MOptions;
	$Infer: {
		m2mClient: M2MClient;
	};
} 