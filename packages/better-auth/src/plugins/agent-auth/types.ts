import type { GenericEndpointContext } from "@better-auth/core";
import type { User } from "../../types";

/**
 * Notification data passed to sendNotification callback
 */
export interface AgentNotificationData {
	/** The user to notify */
	user: User;
	/** URL user should visit to approve/reject */
	approvalUrl: string;
	/** Optional message to show user (context for what they're approving) */
	message?: string;
	/** Client/agent ID requesting access */
	clientId: string;
	/** Requested scopes */
	scope: string;
	/** When the request expires */
	expiresAt: Date;
}

/**
 * Agent Auth plugin options
 */
export interface AgentAuthOptions {
	/**
	 * Callback to send notification to user when an agent requests access.
	 * You decide how to notify: email, SMS, push notification, etc.
	 *
	 * @example
	 * ```ts
	 * sendNotification: async ({ user, approvalUrl }) => {
	 *   await sendEmail(user.email, `Approve access: ${approvalUrl}`);
	 * }
	 * ```
	 */
	sendNotification: (
		data: AgentNotificationData,
		request?: Request,
	) => Promise<void>;

	/**
	 * How long the auth request is valid before it expires.
	 * Use formats like "5m", "30s", "1h"
	 * @default "5m"
	 */
	requestLifetime?: string;

	/**
	 * Minimum time between agent polling attempts.
	 * Use formats like "5s", "10s"
	 * @default "5s"
	 */
	pollingInterval?: string;

	/**
	 * The page where users approve/reject requests.
	 * Can be absolute URL or relative path.
	 * @default "/agent/approve"
	 */
	approvalUri?: string;

	/**
	 * Custom function to find user from identifier (email, phone, username).
	 * By default, searches by email, then phone, then username.
	 */
	resolveUser?: (
		identifier: string,
		ctx: GenericEndpointContext,
	) => Promise<User | null>;

	/**
	 * Enable async authentication (CIBA).
	 * Agent requests auth → User gets notification → User approves.
	 * @default true
	 */
	asyncAuth?: boolean;

	// Note: delegation (Token Exchange) and tokenStorage (Token Vault)
	// options will be added when those features are implemented
}
