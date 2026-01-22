import type { GenericEndpointContext } from "@better-auth/core";
import type { User } from "../../types";

/**
 * CIBA request status
 */
export type CibaRequestStatus = "pending" | "approved" | "rejected" | "expired";

/**
 * CIBA request data stored in verification table or secondary storage
 */
export interface CibaRequestData {
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
	status: CibaRequestStatus;
	/** When the request expires */
	expiresAt: number;
	/** Last time agent polled for this request */
	lastPolledAt?: number;
	/** Minimum polling interval in milliseconds */
	pollingInterval: number;
	/** When the request was created */
	createdAt: number;
}

/**
 * Notification data passed to sendNotification callback
 */
export interface CibaNotificationData {
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
 * CIBA plugin options
 */
export interface CibaOptions {
	/**
	 * Callback to send notification to user
	 * The implementer decides how to notify (email, SMS, push, etc.)
	 */
	sendNotification: (
		data: CibaNotificationData,
		request?: Request,
	) => Promise<void>;

	/**
	 * How long the CIBA request is valid
	 * Use formats like "5m", "30s", "1h"
	 * @default "5m"
	 */
	requestLifetime?: string;

	/**
	 * Minimum polling interval for agents
	 * Use formats like "5s", "10s"
	 * @default "5s"
	 */
	pollingInterval?: string;

	/**
	 * The URI where users approve/deny the request.
	 * Can be absolute URL or relative path.
	 * The auth_req_id will be appended as a query parameter.
	 * @default "/ciba/approve"
	 */
	approvalUri?: string;

	/**
	 * Custom function to resolve user from login_hint
	 * By default, searches by email, then phone, then username
	 */
	resolveUser?: (
		loginHint: string,
		ctx: GenericEndpointContext,
	) => Promise<User | null>;
}

/**
 * Internal options with defaults applied
 */
export interface CibaInternalOptions {
	sendNotification: CibaOptions["sendNotification"];
	/** Request lifetime as TimeString */
	requestLifetime: string;
	/** Polling interval as TimeString */
	pollingInterval: string;
	approvalUri: string;
	resolveUser?: CibaOptions["resolveUser"];
}

/**
 * CIBA backchannel authorize response
 */
export interface BcAuthorizeResponse {
	/** Unique identifier for the authentication request */
	auth_req_id: string;
	/** Lifetime of the auth_req_id in seconds */
	expires_in: number;
	/** Minimum time between polling requests in seconds */
	interval: number;
}

/**
 * CIBA token error response (while pending)
 */
export interface CibaTokenPendingError {
	error:
		| "authorization_pending"
		| "slow_down"
		| "expired_token"
		| "access_denied";
	error_description: string;
}
