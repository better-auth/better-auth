import type { OAuthExtensionGrantHandler } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { SLOW_DOWN_INCREMENT } from "./constants";
import { CIBA_ERROR_CODES } from "./error-codes";
import type { CibaOptions } from "./types";
import {
	buildCibaIssuanceExtras,
	consumeApprovedCibaRequest,
	deleteCibaRequest,
	findCibaRequestByHash,
	hashAuthReqId,
	ratchetPollingInterval,
	updateCibaRequest,
} from "./utils";

/**
 * Token-endpoint handler for the CIBA grant. The agent polls here with its
 * `auth_req_id`; once the user has approved, the request is atomically claimed
 * (consumed) and the token set is issued through the shared provider.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html#rfc.section.11
 */
export function createCibaGrantHandler(
	options: CibaOptions,
): OAuthExtensionGrantHandler {
	return async ({ ctx, provider }) => {
		const rawAuthReqId = ctx.body?.auth_req_id;
		if (!rawAuthReqId || typeof rawAuthReqId !== "string") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: "auth_req_id is required for the CIBA grant",
			});
		}

		const request = await findCibaRequestByHash(
			ctx,
			await hashAuthReqId(rawAuthReqId),
		);
		if (!request) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_grant",
				error_description: CIBA_ERROR_CODES.INVALID_GRANT.message,
			});
		}

		const scopes = request.scope.split(" ").filter(Boolean);
		// Re-authenticate the polling client and re-validate the stored scopes
		// against the current client record (catches scopes revoked after the
		// request was created). The bound grant type enforces CIBA registration.
		// `confirmation` carries any sender-constraint the auth step proved
		// (mTLS / extension strategy) and is forwarded to issuance.
		const { client, clientId, confirmation } =
			await provider.authenticateClient({
				scopes,
				requireCredentials: options.requireConfidentialClient !== false,
			});
		if (request.clientId !== clientId) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_grant",
				error_description: CIBA_ERROR_CODES.INVALID_GRANT.message,
			});
		}

		// slow_down: a poll faster than the interval ratchets the interval up for
		// this and subsequent polls (CIBA §11) and is rejected. lastPolledAt is left
		// untouched in that branch so the gate keeps measuring from the last accepted
		// poll. This read-then-write check is not atomic, so a client that fans out
		// simultaneous polls can occasionally slip an extra one through; slow_down is
		// advisory rate limiting, and the hard single-use guarantee is the atomic
		// consume below, not this gate.
		const now = Date.now();
		if (
			request.lastPolledAt &&
			now - new Date(request.lastPolledAt).getTime() <
				request.pollingInterval * 1000
		) {
			await ratchetPollingInterval(ctx, request.id, SLOW_DOWN_INCREMENT);
			throw new APIError("BAD_REQUEST", {
				error: "slow_down",
				error_description: CIBA_ERROR_CODES.SLOW_DOWN.message,
			});
		}
		await updateCibaRequest(ctx, request.id, { lastPolledAt: new Date() });

		if (request.expiresAt < new Date()) {
			await deleteCibaRequest(ctx, request.id);
			throw new APIError("BAD_REQUEST", {
				error: "expired_token",
				error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
			});
		}

		// A push-mode request was already redeemed inline at approval; it is not
		// pollable (CIBA §5). The row is gone by now, so this is defensive.
		if (request.deliveryMode === "push") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_grant",
				error_description: CIBA_ERROR_CODES.UNSUPPORTED_DELIVERY_MODE.message,
			});
		}

		if (request.status === "pending") {
			throw new APIError("BAD_REQUEST", {
				error: "authorization_pending",
				error_description: CIBA_ERROR_CODES.AUTHORIZATION_PENDING.message,
			});
		}
		if (request.status === "rejected") {
			await deleteCibaRequest(ctx, request.id);
			throw new APIError("BAD_REQUEST", {
				error: "access_denied",
				error_description: CIBA_ERROR_CODES.ACCESS_DENIED.message,
			});
		}

		// Step-up safety net: re-check the request's acr_values against the user
		// before claiming the request, so a refusal leaves the approved row intact
		// for a retry after the user elevates their authentication. The hook
		// resolves the user's assurance itself and throws to refuse (for example a
		// 403 insufficient_authorization step-up challenge).
		if (options.enforceTokenAcr) {
			await options.enforceTokenAcr(request, ctx);
		}

		// Atomically claim the approved request: concurrent polls contend on this
		// delete-and-return, and only the winner issues tokens (single-use).
		const claimed = await consumeApprovedCibaRequest(ctx, {
			id: request.id,
			clientId,
		});
		if (!claimed) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_grant",
				error_description: CIBA_ERROR_CODES.INVALID_GRANT.message,
			});
		}

		const user = await ctx.context.internalAdapter.findUserById(claimed.userId);
		if (!user) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_grant",
				error_description: "The authorizing user no longer exists",
			});
		}

		const extras = await buildCibaIssuanceExtras(ctx, options, claimed);

		return provider.issueTokens({
			client,
			scopes: claimed.scope.split(" ").filter(Boolean),
			user,
			referenceId: claimed.authReqId,
			// The user authenticated at approval time, not at this poll (OIDC auth_time).
			authTime: claimed.approvedAt ?? new Date(),
			confirmation,
			accessTokenClaims: extras.accessTokenClaims,
			tokenResponse: extras.tokenResponse,
			resources: extras.resources,
		});
	};
}
