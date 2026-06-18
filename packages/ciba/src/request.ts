import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import { findCibaRequestByHash, getOAuthOptions, hashAuthReqId } from "./utils";

/**
 * GET /ciba/request — returns the non-sensitive details an approval page renders
 * (client name, scopes, binding message). The high-entropy `auth_req_id` is the
 * only credential; this endpoint reads, it does not verify or change state.
 */
export function createCibaGetRequest() {
	return createAuthEndpoint(
		"/ciba/request",
		{
			method: "GET",
			query: z.object({ auth_req_id: z.string().min(1) }),
			metadata: {
				// The auth_req_id is a bearer credential in the query string and the
				// body returns request details: never cache it.
				noStore: true,
				openapi: {
					description: "Get CIBA request details for the approval page",
				},
			},
		},
		async (ctx) => {
			const request = await findCibaRequestByHash(
				ctx,
				await hashAuthReqId(ctx.query.auth_req_id),
			);
			if (!request || request.expiresAt < new Date()) {
				throw new APIError("NOT_FOUND", {
					error: "invalid_request",
					error_description: "CIBA request not found or expired",
				});
			}

			const client = await getOAuthProviderApi(
				ctx,
				getOAuthOptions(ctx),
			).getClient(request.clientId);

			// RAR is returned parsed so the approval page can render the requested
			// actions; a malformed stored value is surfaced as null rather than failing.
			let authorizationDetails: unknown;
			if (request.authorizationDetails) {
				try {
					authorizationDetails = JSON.parse(request.authorizationDetails);
				} catch {
					authorizationDetails = null;
				}
			}

			return ctx.json({
				client_name: client?.name,
				scope: request.scope,
				binding_message: request.bindingMessage,
				authorization_details: authorizationDetails,
				acr_values: request.acrValues,
				status: request.status,
				expires_at: request.expiresAt.toISOString(),
			});
		},
	);
}
