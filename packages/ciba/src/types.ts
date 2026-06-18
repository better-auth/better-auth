import type { GenericEndpointContext } from "@better-auth/core";
import type { CibaDeliveryMode, CibaRequest } from "./utils";

/**
 * Payload handed to {@link CibaOptions.sendNotification} so the deployment can
 * reach the user on a separate device and link them to the approval page.
 */
export interface SendNotificationData {
	/** The user the client is asking to authenticate. */
	userId: string;
	/** The authenticated client requesting authorization. */
	clientId: string;
	/** Registered display name of the client, when known. */
	clientName?: string;
	/** Space-delimited scopes the client requested. */
	scope: string;
	/** Human-readable message to display on both devices to bind the session (CIBA §7.1). */
	bindingMessage?: string;
	/** Parsed RFC 9396 `authorization_details`, when the request carried it. */
	authorizationDetails?: unknown;
	/** Requested `acr_values` (OIDC §3.1.2.1), when the request carried it. */
	acrValues?: string;
	/**
	 * Absolute URL of the approval page, with the `auth_req_id` already attached.
	 * Send this to the user; the page calls the CIBA endpoints to approve or deny.
	 */
	approvalUrl: string;
	/**
	 * RFC 9449-style client attestation JWT from the `OAuth-Client-Attestation`
	 * header, when present. Lets the deployment record runtime proof of the
	 * calling agent before notifying the user.
	 *
	 * @see https://www.ietf.org/archive/id/draft-ietf-oauth-attestation-based-client-auth-08.html
	 */
	attestationJwt?: string;
	/**
	 * Client attestation PoP JWT from the `OAuth-Client-Attestation-PoP` header,
	 * when present.
	 */
	attestationPopJwt?: string;
}

export interface CibaOptions {
	/**
	 * Notify the user of a pending backchannel request on a separate channel
	 * (email, push, SMS, ...). Best-effort: it is awaited so delivery is attempted
	 * before the backchannel responds, which keeps it reliable on serverless where
	 * work scheduled after the response can be frozen. A thrown error is caught
	 * and logged, and the request still returns its `auth_req_id`. Because it is
	 * awaited, a slow channel delays the response; keep the handler fast or enqueue
	 * the slow work yourself.
	 */
	sendNotification: (
		data: SendNotificationData,
		request?: Request,
	) => Promise<void> | void;

	/**
	 * Path of the approval page the user lands on from the notification. The
	 * `auth_req_id` is appended as a query parameter. This page is your
	 * application's UI; CIBA leaves the authentication-device interaction
	 * undefined, so there is no default.
	 */
	approvalPage: string;

	/**
	 * Token delivery modes the deployment supports (CIBA §4). A request whose
	 * client registered a mode not listed here is rejected. Advertised in
	 * discovery metadata as `backchannel_token_delivery_modes_supported`.
	 *
	 * @default ["poll"]
	 */
	deliveryModes?: CibaDeliveryMode[];

	/**
	 * Lifetime of a backchannel auth request, in seconds. A request not approved
	 * within this window expires and the agent receives `expired_token`.
	 *
	 * @default 300
	 */
	requestExpiry?: number;

	/**
	 * Minimum interval the agent must wait between token-endpoint polls, in
	 * seconds. Returned as `interval` in the backchannel response.
	 *
	 * @default 5
	 */
	pollingInterval?: number;

	/**
	 * Resolve the user a `login_hint` identifies. Defaults to an email lookup via
	 * the internal adapter. Return `null` when no user matches.
	 */
	resolveUser?: (
		loginHint: string,
		ctx: GenericEndpointContext,
	) => Promise<{ id: string } | null> | { id: string } | null;

	/**
	 * Resolve the client notification endpoint for ping/push delivery when the
	 * client did not pass `client_notification_uri` on the request. Typically
	 * reads an endpoint stored in client metadata at registration.
	 */
	resolveClientNotificationEndpoint?: (
		clientId: string,
		ctx: GenericEndpointContext,
	) => Promise<string | undefined> | string | undefined;

	/**
	 * Retry attempts for push/ping notification delivery.
	 *
	 * @default 3
	 */
	pushRetryAttempts?: number;

	/**
	 * Require the calling client to authenticate with credentials. CIBA clients
	 * are confidential by default; set to `false` only if a deployment genuinely
	 * needs public clients on the backchannel.
	 *
	 * @default true
	 */
	requireConfidentialClient?: boolean;

	/**
	 * Build extra access-token claims for a CIBA issuance. Called after the
	 * request is claimed and before tokens are minted, with the consumed request
	 * row, so the deployment can derive claims from request state (scope, RAR,
	 * `acr_values`, `authContextId`). Returned claims are merged into the access
	 * token JWT; reserved RFC 9068 names stay owned by the authorization server.
	 */
	buildAccessTokenClaims?: (
		cibaRequest: CibaRequest,
		ctx: GenericEndpointContext,
	) => Promise<Record<string, unknown>> | Record<string, unknown>;

	/**
	 * Enforce the request's `acr_values` against the authorizing user at token
	 * issuance (CIBA's analogue of an authorization-time step-up check). Called
	 * with the approved request just before it is consumed and tokens are minted;
	 * the user is loaded and the request is approved but not yet claimed. Throw an
	 * `APIError` to refuse issuance (for example a `403 insufficient_authorization`
	 * step-up challenge). Because this runs before the single-use consume, a
	 * refusal leaves the approved row intact so the client can retry after the user
	 * elevates their authentication; bound repeated step-up failures inside the
	 * hook if you need to limit retries.
	 */
	enforceTokenAcr?: (
		cibaRequest: CibaRequest,
		ctx: GenericEndpointContext,
	) => Promise<void> | void;
}
