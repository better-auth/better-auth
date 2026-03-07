import { getClient } from "@better-auth/oauth-provider";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import { findCibaRequest, getOAuthOpts } from "./utils";

/**
 * GET /ciba/verify — Returns non-sensitive metadata for the approval UI.
 * The auth_req_id (~190-bit entropy) serves as the secret.
 */
export function createCibaVerify() {
	return createAuthEndpoint(
		"/ciba/verify",
		{
			method: "GET",
			query: z.object({
				auth_req_id: z.string().min(1),
			}),
			metadata: {
				openapi: {
					description: "Get CIBA request details for the approval UI",
					responses: {
						200: {
							description: "CIBA request details",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { auth_req_id: authReqId } = ctx.query;

			const cibaRequest = await findCibaRequest(ctx, authReqId);
			if (!cibaRequest) {
				throw new APIError("NOT_FOUND", {
					error_description: "CIBA request not found or expired",
					error: "invalid_request",
				});
			}

			if (cibaRequest.expiresAt < new Date()) {
				throw new APIError("BAD_REQUEST", {
					error_description: "The auth_req_id has expired",
					error: "expired_token",
				});
			}

			const oauthOpts = getOAuthOpts(ctx);
			const client = await getClient(
				ctx as any,
				oauthOpts,
				cibaRequest.clientId,
			);

			let parsedAuthorizationDetails: unknown;
			if (cibaRequest.authorizationDetails) {
				try {
					parsedAuthorizationDetails = JSON.parse(
						cibaRequest.authorizationDetails,
					);
				} catch {
					// Stored value is corrupt — surface as null rather than 500
					parsedAuthorizationDetails = null;
				}
			}

			return ctx.json({
				auth_req_id: cibaRequest.authReqId,
				client_name: client?.name,
				scope: cibaRequest.scope,
				binding_message: cibaRequest.bindingMessage,
				authorization_details: parsedAuthorizationDetails,
				status: cibaRequest.status,
				expires_at: cibaRequest.expiresAt.toISOString(),
			});
		},
	);
}
