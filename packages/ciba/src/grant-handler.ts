import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import {
	basicToClientCredentials,
	validateClientCredentials,
	createUserTokens,
} from "@better-auth/oauth-provider";
import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";
import type { CibaOptions } from "./types";
import { findCibaRequest, deleteCibaRequest, updateCibaRequest } from "./utils";

const SLOW_DOWN_INCREMENT = 5;

/**
 * Creates the CIBA grant handler that runs inside the oauth-provider's
 * token endpoint switch-default case.
 *
 * Called as: handler(ctx, opts) where opts = OAuthOptions from oauth-provider.
 * Returns a full ctx.json() Response (same shape as createUserTokens).
 */
export function createCibaGrantHandler(_options: CibaOptions) {
	return async (
		ctx: GenericEndpointContext,
		opts: OAuthOptions<Scope[]>,
	) => {
		let clientId: string | undefined = ctx.body?.client_id;
		let clientSecret: string | undefined = ctx.body?.client_secret;
		const authReqId: string | undefined = ctx.body?.auth_req_id;

		const authorization =
			ctx.request?.headers.get("authorization") || null;
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

		const client = await validateClientCredentials(
			ctx,
			opts,
			clientId,
			clientSecret,
		);

		const cibaRequest = await findCibaRequest(ctx, authReqId);
		if (!cibaRequest) {
			throw new APIError("BAD_REQUEST", {
				error_description: "The auth_req_id is invalid or has already been consumed",
				error: "invalid_grant",
			});
		}

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
					pollingInterval:
						cibaRequest.pollingInterval + SLOW_DOWN_INCREMENT,
				});
				throw new APIError("BAD_REQUEST", {
					error_description:
						"Polling too frequently, increase interval",
					error: "slow_down",
				});
			}
		}
		await updateCibaRequest(ctx, cibaRequest.id, { lastPolledAt: now });

		switch (cibaRequest.status) {
			case "pending":
				throw new APIError("BAD_REQUEST", {
					error_description:
						"The authorization request is still pending",
					error: "authorization_pending",
				});

			case "rejected":
				await deleteCibaRequest(ctx, authReqId);
				throw new APIError("FORBIDDEN", {
					error_description:
						"The user denied the authorization request",
					error: "access_denied",
				});

			case "approved": {
				const user =
					await ctx.context.internalAdapter.findUserById(
						cibaRequest.userId,
					);
				if (!user) {
					await deleteCibaRequest(ctx, authReqId);
					throw new APIError("BAD_REQUEST", {
						error_description:
							"User not found, may have been deleted",
						error: "invalid_request",
					});
				}

				const scopes = cibaRequest.scope.split(" ");

				// Inject resource into ctx.body for checkResource()
				if (cibaRequest.resource) {
					ctx.body.resource = cibaRequest.resource;
				}

				// Delete before issuing to prevent replay
				await deleteCibaRequest(ctx, authReqId);

				return createUserTokens(
					ctx,
					opts,
					client,
					scopes,
					user,
					undefined,
					undefined,
					undefined,
					undefined,
					new Date(),
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
