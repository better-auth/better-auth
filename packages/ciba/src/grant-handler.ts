import type { GenericEndpointContext } from "@better-auth/core";
import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";
import {
	basicToClientCredentials,
	createUserTokens,
	validateClientCredentials,
} from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import type { CibaOptions } from "./types";
import { deleteCibaRequest, findCibaRequest, updateCibaRequest } from "./utils";

const SLOW_DOWN_INCREMENT = 5;

/**
 * Creates the CIBA grant handler that runs inside the oauth-provider's
 * token endpoint switch-default case.
 *
 * Called as: handler(ctx, opts) where opts = OAuthOptions from oauth-provider.
 * Returns a full ctx.json() Response (same shape as createUserTokens).
 */
export function createCibaGrantHandler(_options: CibaOptions) {
	return async (ctx: GenericEndpointContext, opts: OAuthOptions<Scope[]>) => {
		let clientId: string | undefined = ctx.body?.client_id;
		let clientSecret: string | undefined = ctx.body?.client_secret;
		const authReqId: string | undefined = ctx.body?.auth_req_id;

		const authorization = ctx.request?.headers.get("authorization") || null;
		if (authorization?.startsWith("Basic ")) {
			const res = basicToClientCredentials(authorization);
			clientId = res?.client_id;
			clientSecret = res?.client_secret;
		}

		if (!clientId) {
			throw new APIError("BAD_REQUEST", {
				error_description: "client_id is required",
				error: "invalid_request",
			});
		}
		if (!authReqId) {
			throw new APIError("BAD_REQUEST", {
				error_description: "auth_req_id is required for CIBA grant",
				error: "invalid_request",
			});
		}

		const cibaRequest = await findCibaRequest(ctx, authReqId);
		if (!cibaRequest) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"The auth_req_id is invalid or has already been consumed",
				error: "invalid_grant",
			});
		}

		// Validate client credentials with the stored scopes
		const scopes = cibaRequest.scope.split(" ");
		const client = await validateClientCredentials(
			ctx,
			opts,
			clientId,
			clientSecret,
			scopes,
		);

		if (cibaRequest.clientId !== clientId) {
			throw new APIError("BAD_REQUEST", {
				error_description: "auth_req_id does not belong to this client",
				error: "invalid_grant",
			});
		}

		// Check expiry first to avoid wasting rate-limit state on expired requests
		if (cibaRequest.expiresAt < new Date()) {
			await deleteCibaRequest(ctx, authReqId);
			throw new APIError("BAD_REQUEST", {
				error_description: "The auth_req_id has expired",
				error: "expired_token",
			});
		}

		// Push-mode requests are not redeemable via polling (CIBA §5)
		if (cibaRequest.deliveryMode === "push") {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"Push-mode requests cannot be polled; tokens are delivered to the client notification endpoint",
				error: "invalid_grant",
			});
		}

		// Rate limiting (slow_down)
		const now = Date.now();
		if (cibaRequest.lastPolledAt) {
			const elapsed = now - cibaRequest.lastPolledAt;
			if (elapsed < cibaRequest.pollingInterval * 1000) {
				await updateCibaRequest(ctx, cibaRequest.id, {
					lastPolledAt: now,
					pollingInterval: cibaRequest.pollingInterval + SLOW_DOWN_INCREMENT,
				});
				throw new APIError("BAD_REQUEST", {
					error_description: "Polling too frequently, increase interval",
					error: "slow_down",
				});
			}
		}
		await updateCibaRequest(ctx, cibaRequest.id, { lastPolledAt: now });

		switch (cibaRequest.status) {
			case "pending":
				throw new APIError("BAD_REQUEST", {
					error_description: "The authorization request is still pending",
					error: "authorization_pending",
				});

			case "rejected":
				await deleteCibaRequest(ctx, authReqId);
				throw new APIError("BAD_REQUEST", {
					error_description: "The user denied the authorization request",
					error: "access_denied",
				});

			case "approved": {
				const user = await ctx.context.internalAdapter.findUserById(
					cibaRequest.userId,
				);
				if (!user) {
					await deleteCibaRequest(ctx, authReqId);
					throw new APIError("BAD_REQUEST", {
						error_description: "User not found, may have been deleted",
						error: "invalid_request",
					});
				}

				// Inject resource into ctx.body for checkResource()
				if (cibaRequest.resource) {
					ctx.body.resource = cibaRequest.resource;
				}

				// Build extra claims: act (agent identity) + authorization_details (RAR)
				const extra: {
					accessTokenClaims: Record<string, unknown>;
					tokenResponse?: Record<string, unknown>;
				} = { accessTokenClaims: { act: { sub: client.clientId } } };

				if (cibaRequest.authorizationDetails) {
					try {
						const ad = JSON.parse(cibaRequest.authorizationDetails);
						extra.accessTokenClaims.authorization_details = ad;
						extra.tokenResponse = { authorization_details: ad };
					} catch {
						// Ignore malformed JSON — issue tokens without authorization_details
					}
				}

				if (cibaRequest.agentClaims) {
					try {
						const ac = JSON.parse(cibaRequest.agentClaims);
						if (ac.agent) {
							extra.accessTokenClaims.agent = ac.agent;
						}
					} catch {
						// Ignore malformed agent claims
					}
				}

				if (_options.buildAccessTokenClaims) {
					const custom = await _options.buildAccessTokenClaims(
						cibaRequest,
						ctx,
					);
					Object.assign(extra.accessTokenClaims, custom);
				}

				// Delete after building claims but before issuing to prevent replay
				await deleteCibaRequest(ctx, authReqId);

				return createUserTokens(
					ctx,
					opts,
					client,
					scopes,
					user,
					authReqId,
					undefined,
					undefined,
					undefined,
					new Date(),
					extra,
				);
			}

			default:
				throw new APIError("INTERNAL_SERVER_ERROR", {
					error_description: "Unexpected CIBA request status",
					error: "server_error",
				});
		}
	};
}
