import type { GenericEndpointContext } from "@better-auth/core";
import type { DBTransactionAdapter } from "@better-auth/core/db/adapter";
import { APIError } from "better-auth/api";
import { schemaToOAuth } from "./register";
import type {
	OAuthOptions,
	PendingClientApprovalContext,
	SchemaClient,
	Scope,
} from "./types";

/**
 * Asks the application whether the consenting user may approve a pending
 * client, and validates the owner it returns.
 *
 * Nothing is stored here. The owner is applied by
 * {@link storeClientApproval} in the same transaction as the consent.
 *
 * @returns The owner's reference id, or `false` when the application refuses.
 */
export async function resolveClientApproval(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: {
		client: SchemaClient<Scope[]>;
		user: PendingClientApprovalContext["user"];
		session: PendingClientApprovalContext["session"];
		scopes: Scope[];
		consentReferenceId?: string;
	},
): Promise<string | false> {
	if (!opts.approvePendingClient) {
		throw new APIError("FORBIDDEN", {
			error: "access_denied",
			error_description: "client is pending approval",
		});
	}
	if (!ctx.headers) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: "request headers are required",
		});
	}
	const approval = await opts.approvePendingClient({
		client: { ...schemaToOAuth(input.client), client_secret: undefined },
		user: input.user,
		session: input.session,
		scopes: input.scopes,
		consentReferenceId: input.consentReferenceId,
		headers: ctx.headers,
	});
	if (!approval) return false;

	const clientReference = approval.clientReference;
	if (typeof clientReference !== "string" || clientReference.length === 0) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: "approvePendingClient must return a clientReference",
		});
	}
	return clientReference;
}

/**
 * Moves a pending client to approved with its owner.
 *
 * The update only matches a client that is still pending and has no owner, so
 * of any concurrent approvals exactly one wins and an owned client is never
 * reassigned. Call it inside the transaction that stores the consent so a
 * failed consent cannot leave an owned client behind.
 *
 * @throws APIError CONFLICT when the client is no longer pending or unowned.
 */
export async function storeClientApproval(
	adapter: Pick<DBTransactionAdapter, "updateMany">,
	opts: Pick<OAuthOptions<Scope[]>, "schema">,
	clientId: string,
	referenceId: string,
): Promise<void> {
	const approved = await adapter.updateMany({
		model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
		where: [
			{ field: "clientId", value: clientId },
			{ field: "pending", value: true },
			{ field: "userId", value: null },
			{ field: "referenceId", value: null },
		],
		update: {
			pending: false,
			referenceId,
			updatedAt: new Date(),
		},
	});
	if (approved !== 1) {
		throw new APIError("CONFLICT", {
			error: "access_denied",
			error_description: "client is no longer pending approval",
		});
	}
}
