import type { OAuthExtensionGrantHandler } from "@better-auth/oauth-provider";
import {
	resolveResourcePolicy,
	validateClientScopes,
} from "@better-auth/oauth-provider/internal";
import { APIError } from "better-auth/api";
import { redeemPolledAuthorization } from "better-auth/plugins/device-authorization";
import { CIBA_ERROR_CODES } from "./error-codes";
import type { CibaOptions } from "./types";
import type { StoredCibaRequest } from "./utils";
import { hashAuthReqId, toCibaRequest } from "./utils";

const scopesOf = (request: StoredCibaRequest) => request.scope.split(" ");

/**
 * Token-endpoint handler for the CIBA grant (CIBA §10.1). Polling, expiry,
 * denial, and the single-use claim run through the same state machine as the
 * device authorization grant; this handler adds client ownership and resource
 * checks, then issues through the shared provider.
 */
export const createCibaGrantHandler =
	(options: CibaOptions): OAuthExtensionGrantHandler =>
	async ({ ctx, opts, provider }) => {
		const authReqId = ctx.body?.auth_req_id;
		if (!authReqId || typeof authReqId !== "string") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: "auth_req_id is required",
			});
		}

		const {
			claimed,
			authorizationContext: { client, confirmation },
			redemptionContext: hookClaims,
			user,
		} = await redeemPolledAuthorization<
			StoredCibaRequest,
			Awaited<ReturnType<typeof provider.authenticateClient>>,
			Record<string, unknown> | undefined
		>({
			ctx,
			model: "cibaRequest",
			where: [
				{ field: "authReqId", value: await hashAuthReqId(ctx, authReqId) },
			],
			messages: {
				invalid: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
				expired: CIBA_ERROR_CODES.EXPIRED_AUTH_REQ_ID.message,
				invalidStatus: CIBA_ERROR_CODES.INVALID_REQUEST_STATUS.message,
			},
			authorizeRedemption: async (request) => {
				const authentication = await provider.authenticateClient({
					requireCredentials: !options.allowPublicClients,
				});
				// Compare owners before scope validation, so another client holding a
				// stolen auth_req_id learns nothing about the request's scopes.
				if (request.clientId !== authentication.clientId) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_grant",
						error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
					});
				}
				validateClientScopes(authentication.client, scopesOf(request));
				return {
					ownershipWhere: { field: "clientId", value: authentication.clientId },
					context: authentication,
				};
			},
			// Everything that can refuse runs before the claim, so a refusal keeps the
			// approved request for another poll.
			prepareRedemption: async (request, authentication) => {
				await resolveResourcePolicy(ctx, opts, {
					resource: request.resources ?? undefined,
					clientId: authentication.clientId,
					requestedScopes: scopesOf(request),
				});
				const result = await options.beforeTokenIssuance?.({
					request: toCibaRequest(request),
					ctx,
				});
				return result?.accessTokenClaims;
			},
		});

		// RFC 9396 §7: the token response and the access token carry the granted
		// authorization_details.
		const authorizationDetails = claimed.authorizationDetails ?? undefined;
		return provider.issueTokens({
			client,
			scopes: scopesOf(claimed),
			user,
			resources: claimed.resources ?? undefined,
			authTime: claimed.authTime ?? undefined,
			accessTokenClaims: {
				...hookClaims,
				...(authorizationDetails
					? { authorization_details: authorizationDetails }
					: {}),
			},
			tokenResponse: authorizationDetails
				? { authorization_details: authorizationDetails }
				: undefined,
			// A DPoP proof on this poll, or a sender-constraint proved at client
			// authentication, binds the issued token.
			confirmation,
		});
	};
