/**
 * Webhook event names emitted for database lifecycle changes.
 */
export type WebhookEventName =
	| "user.created"
	| "user.updated"
	| "user.deleted"
	| "session.created"
	| "session.updated"
	| "session.deleted"
	| "account.created"
	| "account.updated"
	| "account.deleted";

export type WebhookPayload<TType extends WebhookEventName = WebhookEventName> =
	{
		/**
		 * Unique delivery id (also sent as `X-Better-Auth-Webhook-Id`).
		 */
		id: string;
		type: TType;
		/**
		 * ISO-8601 timestamp when the event was emitted.
		 */
		timestamp: string;
		data: WebhookEventDataMap[TType];
	};

export type WebhookEventDataMap = {
	"user.created": Record<string, unknown>;
	"user.updated": Record<string, unknown>;
	"user.deleted": Record<string, unknown>;
	"session.created": Record<string, unknown>;
	"session.updated": Record<string, unknown>;
	"session.deleted": Record<string, unknown>;
	"account.created": Record<string, unknown>;
	"account.updated": Record<string, unknown>;
	"account.deleted": Record<string, unknown>;
};

/**
 * A destination URL (full path on your server) that receives POST requests with signed JSON payloads.
 */
export type WebhookEndpoint = {
	/**
	 * HTTPS (or HTTP for local development) URL to POST webhook deliveries to.
	 */
	url: string;
	/**
	 * Shared secret used to compute the HMAC-SHA256 signature. Must be kept private on both sides.
	 */
	secret: string;
	/**
	 * If set, only these events are sent to this URL. When omitted, all events are delivered.
	 */
	events?: WebhookEventName[] | undefined;
};

export type WebhooksPluginOptions = {
	/**
	 * One or more webhook destinations. Each may use a different secret and event filter.
	 */
	endpoints: WebhookEndpoint[];
	/**
	 * Request timeout in milliseconds for each delivery attempt.
	 * @default 10_000
	 */
	timeoutMs?: number | undefined;
	/**
	 * Number of retry attempts after the first failed delivery (not counting network errors before response).
	 * @default 1
	 */
	retries?: number | undefined;
};
