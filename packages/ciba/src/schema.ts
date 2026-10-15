import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

/**
 * A backchannel authentication request.
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
			/** The user the `login_hint` identified, the only one who may decide. */
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
				index: true,
			},
			/** Requested scopes, narrowed to the approved ones on approval. */
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
			/** Consent reference the approval recorded, such as an organization. */
			referenceId: {
				type: "string",
				required: false,
			},
			/** Creation time of the approving session, issued as `auth_time`. */
			authTime: {
				type: "date",
				required: false,
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

/** A stored backchannel authentication request. */
export interface CibaRequest {
	id: string;
	authReqId: string;
	clientId: string;
	userId: string;
	scope: string;
	bindingMessage?: string | null;
	resources?: string[] | null;
	status: "pending" | "approved" | "denied";
	referenceId?: string | null;
	authTime?: Date | null;
	lastPolledAt?: Date | null;
	expiresAt: Date;
	createdAt: Date;
}
