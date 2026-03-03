import type { GenericEndpointContext } from "@better-auth/core";
import type { User } from "../../types";

/**
 * Token delivery mode (CIBA spec)
 * - poll: Client polls the token endpoint (default)
 * - push: Server pushes tokens to client's notification endpoint
 */
export type AsyncAuthDeliveryMode = "poll" | "push";

/**
 * Request status
 */
export type AsyncAuthRequestStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "expired";

/**
 * Request data stored in verification table or secondary storage
 */
export interface AsyncAuthRequestData {
	/** Unique auth request ID */
	authReqId: string;
	/** Client ID that initiated the request */
	clientId: string;
	/** User ID being authenticated */
	userId: string;
	/** Requested scopes */
	scope: string;
	/** Optional binding message shown to user */
	bindingMessage?: string;
	/** Request status */
	status: AsyncAuthRequestStatus;
	/** When the request expires */
	expiresAt: number;
	/** Last time agent polled for this request */
	lastPolledAt?: number;
	/** Minimum polling interval in milliseconds */
	pollingInterval: number;
	/** When the request was created */
	createdAt: number;
	/** Token delivery mode for this request */
	deliveryMode: AsyncAuthDeliveryMode;
	/** Client notification token (required for push mode) */
	clientNotificationToken?: string;
	/** Client notification endpoint URL (required for push mode) */
	clientNotificationEndpoint?: string;
}

/**
 * Notification data passed to sendNotification callback
 */
export interface AsyncAuthNotificationData {
	/** The user to notify */
	user: User;
	/** Unique auth request ID */
	authReqId: string;
	/** URL user should visit to approve/deny */
	approvalUrl: string;
	/** Optional message to show user (context for what they're approving) */
	bindingMessage?: string;
	/** Client ID requesting access */
	clientId: string;
	/** Requested scopes */
	scope: string;
	/** When the request expires */
	expiresAt: Date;
}

/**
 * An agent/client that can initiate async auth requests.
 * Define these directly in the asyncAuth config — no separate
 * client registration step needed.
 */
export interface AsyncAuthAgent {
	/** Display name for the agent (shown in approval UI) */
	name?: string;
	/** Unique client identifier the agent uses to authenticate */
	clientId: string;
	/** Secret the agent uses to authenticate */
	clientSecret: string;
	/** Optional metadata (e.g. push delivery settings) */
	metadata?: Record<string, unknown>;
}

/**
 * Internal options with defaults applied (after zod validation)
 */
export interface AsyncAuthInternalOptions {
	sendNotification: (
		data: AsyncAuthNotificationData,
		request?: Request,
	) => Promise<void>;
	/** Request lifetime as TimeString */
	requestLifetime: string;
	/** Polling interval as TimeString */
	pollingInterval: string;
	approvalUri: string;
	resolveUser?: (
		loginHint: string,
		ctx: GenericEndpointContext,
	) => Promise<User | null>;
	/** Default delivery mode */
	deliveryMode: AsyncAuthDeliveryMode;
	/** Inline agent clients — checked first during authentication */
	agents: AsyncAuthAgent[];
}

/**
 * Backchannel authorize response (CIBA spec)
 */
export interface BcAuthorizeResponse {
	/** Unique identifier for the authentication request */
	auth_req_id: string;
	/** Lifetime of the auth_req_id in seconds */
	expires_in: number;
	/** Minimum time between polling requests in seconds (poll mode only) */
	interval?: number;
}

/**
 * Token error response (while pending)
 */
export interface AsyncAuthTokenPendingError {
	error:
		| "authorization_pending"
		| "slow_down"
		| "expired_token"
		| "access_denied";
	error_description: string;
}

/**
 * Token response pushed to client_notification_endpoint per CIBA spec Section 10.3.1
 */
export interface AsyncAuthPushTokenResponse {
	/** Auth request ID for correlation */
	auth_req_id: string;
	access_token: string;
	token_type: "Bearer";
	expires_in: number;
	refresh_token?: string;
	id_token?: string;
	scope?: string;
}

/**
 * Token response generated for an async auth request
 */
export interface AsyncAuthTokenResponse {
	access_token: string;
	token_type: "Bearer";
	expires_in: number;
	refresh_token?: string;
	scope: string;
	id_token?: string;
}
