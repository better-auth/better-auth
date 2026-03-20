import type { GenericEndpointContext } from "@better-auth/core";

/**
 * Data passed to the {@link CibaOptions.sendNotification} callback.
 */
export interface SendNotificationData {
	userId: string;
	authReqId: string;
	clientName?: string;
	scope: string;
	bindingMessage?: string;
	authorizationDetails?: unknown;
	agentClaims?: string;
	approvalUrl: string;
	/**
	 * Client Attestation JWT from the `OAuth-Client-Attestation` header.
	 * @see https://www.ietf.org/archive/id/draft-ietf-oauth-attestation-based-client-auth-08.html
	 */
	attestationJwt?: string;
	/**
	 * Client Attestation PoP JWT from the `OAuth-Client-Attestation-PoP` header.
	 * @see https://www.ietf.org/archive/id/draft-ietf-oauth-attestation-based-client-auth-08.html
	 */
	attestationPopJwt?: string;
}

export interface CibaOptions {
	/**
	 * Notify user about a pending auth request (email, SMS, push, etc.).
	 * Called as fire-and-forget; failures are silently ignored.
	 */
	sendNotification: (
		data: SendNotificationData,
		request?: Request,
	) => Promise<void>;

	/**
	 * Supported token delivery modes.
	 * @default ["poll"]
	 */
	deliveryModes?: ("poll" | "ping" | "push")[];

	/**
	 * Auth request lifetime in seconds.
	 * @default 300
	 */
	requestLifetime?: number;

	/**
	 * Minimum polling interval in seconds.
	 * @default 5
	 */
	pollingInterval?: number;

	/**
	 * Custom user resolution from login_hint.
	 * Default: lookup by email via internalAdapter.
	 */
	resolveUser?: (
		loginHint: string,
		ctx: GenericEndpointContext,
	) => Promise<{ id: string } | null>;

	/**
	 * Resolve the notification endpoint for a given client.
	 * Used for push/ping delivery when the client doesn't provide
	 * client_notification_uri in the backchannel auth request.
	 * Typically reads from client metadata stored during registration.
	 */
	resolveClientNotificationEndpoint?: (
		clientId: string,
		ctx: GenericEndpointContext,
	) => Promise<string | undefined>;

	/**
	 * URL path for the approval page. auth_req_id is added as a query param.
	 * @default "/ciba/approve"
	 */
	approvalPage?: string;

	/**
	 * Push delivery retry attempts.
	 * @default 3
	 */
	pushRetryAttempts?: number;
}
