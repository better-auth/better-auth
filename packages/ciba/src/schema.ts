import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { mergeSchema } from "better-auth/db";
import type { CibaOptions } from "./types";

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
			/** Space-separated `acr_values` the client requested. */
			acrValues: {
				type: "string",
				required: false,
			},
			/** RFC 9396 `authorization_details`, validated against configured types. */
			authorizationDetails: {
				type: "json",
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
			/**
			 * The `auth_req_id`, encrypted with the server secret, kept only for ping
			 * clients so a completion by `request_id` can still send the ping.
			 */
			encryptedAuthReqId: {
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

/** The plugin schema with the deployment's renames and `additionalFields`. */
export function getCibaSchema(options: CibaOptions["schema"]) {
	// Copy each field: mergeSchema writes renames onto the field objects.
	const fields = Object.fromEntries(
		Object.entries(schema.cibaRequest.fields).map(([name, field]) => [
			name,
			{ ...field },
		]),
	);
	return mergeSchema(
		{
			cibaRequest: {
				fields: { ...fields, ...options?.cibaRequest?.additionalFields },
			},
		},
		options,
	);
}
