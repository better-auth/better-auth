import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

/**
 * Persistent state for a backchannel auth request.
 *
 * Lifecycle: `pending` -> `approved` | `rejected`. A poll-mode approved request
 * is atomically claimed and deleted at token issuance (single-use); rejected or
 * expired requests are deleted when next encountered, so the row never outlives
 * the flow. A push-mode request is consumed at approval time.
 */
export const schema = {
	cibaRequest: {
		modelName: "cibaRequest",
		fields: {
			/**
			 * SHA-256 hash of the raw `auth_req_id`. The raw value is returned to the
			 * client and never stored, so a leaked table cannot be used to poll.
			 */
			authReqId: {
				type: "string",
				unique: true,
				required: true,
			},
			clientId: {
				type: "string",
				required: true,
				references: {
					model: "oauthClient",
					field: "clientId",
				},
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
			},
			scope: {
				type: "string",
				required: true,
			},
			bindingMessage: {
				type: "string",
				required: false,
			},
			/**
			 * RFC 9396 Rich Authorization Requests, stored as the raw JSON string the
			 * client sent. Round-tripped into the access token (`authorization_details`
			 * claim) and the token response at issuance.
			 */
			authorizationDetails: {
				type: "string",
				required: false,
			},
			/**
			 * RFC 8707 resource indicator the request is scoped to. Forwarded to
			 * `issueTokens` so the issued token's audience is bound to it.
			 */
			resource: {
				type: "string",
				required: false,
			},
			/**
			 * Requested `acr_values` (OIDC §3.1.2.1, space-delimited). The deployment
			 * enforces step-up against these at approval and at issuance through the
			 * {@link CibaOptions.enforceTokenAcr} hook.
			 */
			acrValues: {
				type: "string",
				required: false,
			},
			/**
			 * Application-defined authentication-context identifier the deployment
			 * stamps after approval (for example a step-up session row id). Opaque to
			 * the plugin; persisted for the deployment to read back at issuance.
			 */
			authContextId: {
				type: "string",
				required: false,
			},
			/** One of `pending`, `approved`, `rejected`. */
			status: {
				type: "string",
				required: true,
			},
			/**
			 * CIBA token delivery mode for this request: `poll`, `ping`, or `push`
			 * (CIBA §4). Set from the requesting client's registered delivery mode.
			 */
			deliveryMode: {
				type: "string",
				required: true,
			},
			/**
			 * Bearer token the client supplied for ping/push notification delivery
			 * (CIBA §7.1, `client_notification_token`). Sent as the `Authorization`
			 * header when the AS calls the client notification endpoint.
			 */
			clientNotificationToken: {
				type: "string",
				required: false,
			},
			/**
			 * Resolved HTTPS endpoint the AS notifies for ping/push delivery (CIBA
			 * §10.2). From `client_notification_uri` or the deployment's
			 * {@link CibaOptions.resolveClientNotificationEndpoint}.
			 */
			clientNotificationEndpoint: {
				type: "string",
				required: false,
			},
			/** When the user approved; stamped as the ID token `auth_time`. */
			approvedAt: {
				type: "date",
				required: false,
			},
			pollingInterval: {
				type: "number",
				required: true,
			},
			/**
			 * Timestamp of the last accepted token-endpoint poll, used by the
			 * `slow_down` gate (CIBA §11). The plugin writes a `Date`; a consumer
			 * mirroring this column in Drizzle must use
			 * `integer({ mode: "timestamp_ms" })`, never `text`, so the adapter's
			 * `.getTime()` write path does not crash.
			 */
			lastPolledAt: {
				type: "date",
				required: false,
			},
			expiresAt: {
				type: "date",
				required: true,
			},
			createdAt: {
				type: "date",
				required: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
