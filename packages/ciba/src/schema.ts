import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

/**
 * A pending backchannel authentication request.
 *
 * Lifecycle: `pending` -> `approved` | `denied`. The token-endpoint poll
 * atomically claims and deletes an approved request (single-use); denied or
 * expired requests are deleted when the client next polls.
 */
export const schema = {
	cibaRequest: {
		fields: {
			/**
			 * The `auth_req_id`, hashed with the OAuth provider's token storage. The
			 * raw value is returned to the client and never stored.
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
				index: true,
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
				index: true,
			},
			scope: {
				type: "string",
				required: true,
			},
			bindingMessage: {
				type: "string",
				required: false,
			},
			/** RFC 8707 resource indicators the issued token is bound to. */
			resources: {
				type: "string[]",
				required: false,
			},
			/** One of `pending`, `approved`, `denied`. */
			status: {
				type: "string",
				required: true,
			},
			/**
			 * Bearer token a ping-mode client supplied (CIBA §7.1), sent back when
			 * the server notifies the client's registered notification endpoint.
			 */
			clientNotificationToken: {
				type: "string",
				required: false,
			},
			/** Creation time of the approving session, issued as `auth_time`. */
			authTime: {
				type: "date",
				required: false,
			},
			/** Minimum time between token polls, in milliseconds. */
			pollingInterval: {
				type: "number",
				required: true,
			},
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
