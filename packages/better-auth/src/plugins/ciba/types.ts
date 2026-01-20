import type { User } from "@better-auth/core/db";
import type { InferOptionSchema } from "../../types/plugins";
import type { schema } from "./schema";

/**
 * CIBA grant type
 */
export const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";

/**
 * User hint types for identifying the user
 */
export interface CIBAUserHints {
	/** Email or username of the user */
	login_hint?: string;
	/** ID token hint to identify the user */
	id_token_hint?: string;
	/** Login hint token */
	login_hint_token?: string;
}

/**
 * Notification request sent to the user
 */
export interface CIBANotificationRequest {
	/** Unique auth request ID */
	authReqId: string;
	/** Client/agent ID requesting access */
	clientId: string;
	/** Client/agent name for display */
	clientName?: string;
	/** Requested scopes */
	scope?: string;
	/** Binding message to show to user */
	bindingMessage?: string;
	/** URL for user to approve */
	approveUrl: string;
	/** URL for user to deny */
	denyUrl: string;
	/** When the request expires */
	expiresAt: Date;
}

/**
 * CIBA Plugin Options
 */
export interface CIBAOptions {
	/**
	 * Lifetime of the authentication request
	 * @default "5m"
	 */
	requestLifetime?: string;

	/**
	 * Polling interval for token endpoint
	 * @default "5s"
	 */
	pollingInterval?: string;

	/**
	 * Function to send notification to the user
	 * This is required and must be implemented by the application
	 */
	sendNotification: (
		user: User,
		request: CIBANotificationRequest,
	) => void | Promise<void>;

	/**
	 * Function to resolve a user from hints
	 * If not provided, defaults to looking up by email from login_hint
	 */
	resolveUser?: (
		hints: CIBAUserHints,
		ctx: { adapter: any },
	) => Promise<User | null>;

	/**
	 * Function to validate client credentials
	 * If not provided, all clients are allowed
	 */
	validateClient?: (
		clientId: string,
		clientSecret?: string,
	) => boolean | Promise<boolean>;

	/**
	 * Get client name for display in notifications
	 */
	getClientName?: (clientId: string) => string | Promise<string>;

	/**
	 * Base URL for approval/denial URLs
	 * If not provided, uses the auth base URL
	 */
	baseUrl?: string;

	/**
	 * Hook called when a request is approved
	 */
	onApproved?: (request: {
		authReqId: string;
		userId: string;
		clientId: string;
		scope?: string;
	}) => void | Promise<void>;

	/**
	 * Hook called when a request is denied
	 */
	onDenied?: (request: {
		authReqId: string;
		userId: string;
		clientId: string;
	}) => void | Promise<void>;

	/**
	 * Custom schema extensions
	 */
	schema?: InferOptionSchema<typeof schema>;
}
