import type {
	GenericEndpointContext,
	InferOptionSchema,
	User,
} from "../../types";
import type { apiKeySchema } from "./schema";

interface ApiKeyEventError_base {
	/**
	 * Error code
	 *
	 * Possible values are:
	 * * `key.notFound`
	 * * `user.forbidden`
	 * * `key.useageExceeded`
	 * * `key.rateLimited`
	 * * `user.unauthorized`
	 * * `key.disabled`
	 * * `key.expired`
	 * * `database.error`
	 * * `key.invalidExpiration`
	 * * `key.invalidRemaining`
	 * * `key.invalidPrefixLength`
	 * * `key.invalidNameLength`
	 */
	code: ApiKeyFailedReasons;
	/**
	 * Error message
	 */
	message: string;
}

interface ApiKeyEventError_rateLimit extends ApiKeyEventError_base {
	code: "key.rateLimited";
	message: string;
	details: {
		tryAgainIn: number;
	};
}

interface ApiKeyEventError_invalidPrefixLength extends ApiKeyEventError_base {
	code: "key.invalidPrefixLength";
	message: string;
	details: {
		minLength: number;
		maxLength: number;
		recievedLength: number;
	};
}

interface ApiKeyEventError_invalidNameLength extends ApiKeyEventError_base {
	code: "key.invalidNameLength";
	message: string;
	details: {
		minLength: number;
		maxLength: number;
		recievedLength: number;
	};
}

export type ApiKeyEventError =
	| ApiKeyEventError_base
	| ApiKeyEventError_rateLimit
	| ApiKeyEventError_invalidPrefixLength
	| ApiKeyEventError_invalidNameLength;
interface ApiKeyEvents_base {
	event: ApiKeyEventTypes;
	/**
	 * if the event was successful, this will be true. Otherwise it will be false.
	 */
	success: boolean;
	/**
	 * if the event wasn't successful, the error object will be passed here. Otherwise it will be null.
	 */
	error: ApiKeyEventError | null;
	/**
	 * User object.
	 *
	 * If the event failed due to an unauthorized user, than this will be null.
	 */
	user: User | null;
}

interface ApiKeyListEvent extends ApiKeyEvents_base {
	event: "key.list";
	apiKey: ApiKey[] | null;
}

interface ApiKeyGetEvent extends ApiKeyEvents_base {
	event: "key.get";
	apiKey: ApiKey | null;
}

interface ApiKeyVerifyEvent extends ApiKeyEvents_base {
	event: "key.verify";
	apiKey: ApiKey | null;
}

interface ApiKeyUpdateEvent extends ApiKeyEvents_base {
	event: "key.update";
	apiKey: ApiKey | null;
}

interface ApiKeyDeleteEvent extends ApiKeyEvents_base {
	event: "key.delete";
	apiKey: ApiKey | null;
}

interface ApiKeyCreateEvent extends ApiKeyEvents_base {
	event: "key.create";
	apiKey: ApiKey | null;
}

export type ApiKeyEvents =
	| ApiKeyListEvent
	| ApiKeyGetEvent
	| ApiKeyVerifyEvent
	| ApiKeyUpdateEvent
	| ApiKeyDeleteEvent
	| ApiKeyCreateEvent;

interface ApiKeyOptionsBase {
	/**
	 * The header name to check for api key
	 * @default "x-api-key"
	 */
	apiKeyHeaders?: string | string[];
	/**
	 * The function to get the api key from the context
	 */
	customAPIKeyGetter?: (ctx: GenericEndpointContext) => string | null;
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
	 * The length of the API key. Longer is better. Default is 64. (Doesn't include the prefix length)
	 * @default 64
	 */
	defaultKeyLength?: number;
	/**
	 * The prefix of the API key.
	 *
	 * Note: We recommend you append an underscore to the prefix to make the prefix more identifiable. (eg `hello_`)
	 */
	defaultPrefix?: string;
	/**
	 * The maximum remaining count that can be applied to a key.
	 *
	 * @default 1_000_000
	 */
	maximumRemaining?: number;
	/**
	 * The minimum remaining count that can be applied to a key.
	 *
	 * Note: This does not reflect the remaining count decreasing. Once this hits 0, then the key is invalid.
	 *
	 * @default 1
	 */
	minimumRemaining?: number;
	/**
	 * The maximum length of the prefix.
	 *
	 * @default 32
	 */
	maximumPrefixLength?: number;
	/**
	 * The minimum length of the prefix.
	 *
	 * @default 1
	 */
	minimumPrefixLength?: number;
	/**
	 * The maximum length of the name.
	 *
	 * @default 32
	 */
	maximumNameLength?: number;
	/**
	 * The minimum length of the name.
	 *
	 * @default 1
	 */
	minimumNameLength?: number;
	/**
	 * Whether to enable metadata for an API key.
	 *
	 * @default false
	 */
	enableMetadata?: boolean;
	/**
	 * Customize the key expiration.
	 */
	keyExpiration?: {
		/**
		 * The default expires time in milliseconds.
		 *
		 * If `null`, then there will be no expiration time.
		 *
		 * @default null
		 */
		defaultExpiresIn?: number | null;
		/**
		 * Wether to disable the expires time passed from the client.
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
	};
	/**
	 * Default rate limiting options.
	 */
	rateLimit?: {
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
	};
	/**
	 * custom schema for the api key plugin
	 */
	schema?: InferOptionSchema<ReturnType<typeof apiKeySchema>>;
	/**
	 * capture events. Useful for analytical purposes.
	 */
	events?: ({ event, success, user, apiKey, error }: ApiKeyEvents) => void;
	/**
	 * An API Key can represent a valid session, so we automatically mock a session for the user if we find a valid API key in the request headers.
	 *
	 * @default false
	 */
	disableSessionForAPIKeys?: boolean;
}

export type ApiKeyOptions = ApiKeyOptionsBase;

export type ApiKeyEventTypes =
	| "key.create"
	| "key.update"
	| "key.verify"
	| "key.get"
	| "key.list"
	| "key.delete";

export type ApiKeyFailedReasons =
	| "key.notFound"
	| "user.forbidden"
	| "key.useageExceeded"
	| "key.rateLimited"
	| "user.unauthorized"
	| "key.disabled"
	| "request.forbidden"
	| "key.expired"
	| "database.error"
	| "key.invalidExpiration"
	| "key.invalidRemaining"
	| "key.invalidPrefixLength"
	| "key.invalidNameLength";

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
	 * The interval in which the `remaining` count is refilled by day
	 *
	 * @example 1 // every day
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
	 * Remaining requests (every time api key is used this should updated and should be updated on refill as well)
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
};
