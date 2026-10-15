import type { OAuthExtensionGrantHandler } from "@better-auth/oauth-provider";
import {
	resolveResourcePolicy,
	toResourceList,
	validateClientScopes,
} from "@better-auth/oauth-provider/internal";
import { CIBA_ERROR_CODES, oauthError } from "./error-codes";
import type { CibaRequest } from "./schema";
import type { ResolvedCibaOptions } from "./types";

/**
 * Token-endpoint handler for the CIBA poll (CIBA §10.1, §11). Polling at the
 * fixed `interval`, expiry, and denial follow the device authorization grant;
 * an approved request is claimed once, atomically, before tokens are issued.
 */
export const createCibaGrantHandler =
	(options: ResolvedCibaOptions): OAuthExtensionGrantHandler =>
	async ({ ctx, opts, provider }) => {
		const authReqId = ctx.body?.auth_req_id;
		if (typeof authReqId !== "string" || !authReqId) {
			oauthError("invalid_request", "auth_req_id is required");
		}
		// CIBA §10.1: the client authenticates as registered.
		const { client, clientId, confirmation } =
			await provider.authenticateClient({
				requireCredentials: !options.allowPublicClients,
			});

		const { adapter } = ctx.context;
		const request = await adapter.findOne<CibaRequest>({
			model: "cibaRequest",
			where: [
				{
					field: "authReqId",
					value: await provider.hashToken(authReqId, "auth_req_id"),
				},
			],
		});
		// Another client's auth_req_id looks unknown, so it reveals nothing.
		if (!request || request.clientId !== clientId) {
			oauthError("invalid_grant", CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message);
		}
		const where = [{ field: "id", value: request.id }];

		// Expiry and denial are terminal and reported at once; only a pending
		// request is held to the polling interval.
		if (request.expiresAt <= new Date()) {
			await adapter.delete({ model: "cibaRequest", where });
			oauthError("expired_token", CIBA_ERROR_CODES.EXPIRED_AUTH_REQ_ID.message);
		}
		if (request.status === "denied") {
			await adapter.delete({ model: "cibaRequest", where });
			oauthError("access_denied", CIBA_ERROR_CODES.ACCESS_DENIED.message);
		}
		if (request.status === "pending") {
			if (
				request.lastPolledAt &&
				Date.now() - request.lastPolledAt.getTime() < options.interval * 1000
			) {
				oauthError(
					"slow_down",
					CIBA_ERROR_CODES.POLLING_TOO_FREQUENTLY.message,
				);
			}
			await adapter.update({
				model: "cibaRequest",
				where,
				update: { lastPolledAt: new Date() },
			});
			oauthError(
				"authorization_pending",
				CIBA_ERROR_CODES.AUTHORIZATION_PENDING.message,
			);
		}

		// Everything that can refuse runs before the claim, so a refusal keeps the
		// approved request for another poll.
		const scopes = request.scope.split(" ");
		validateClientScopes(client, scopes);
		// RFC 8707 §2.2: the poll may narrow the approved resources.
		const approvedResources = request.resources ?? [];
		const selectedResources = toResourceList(ctx.body?.resource);
		if (
			selectedResources?.some(
				(selected) => !approvedResources.includes(selected),
			)
		) {
			oauthError(
				"invalid_target",
				CIBA_ERROR_CODES.UNAPPROVED_RESOURCE.message,
			);
		}
		const resources =
			selectedResources ??
			(approvedResources.length ? approvedResources : undefined);
		const policy = await resolveResourcePolicy(ctx, opts, {
			resource: resources,
			clientId,
			requestedScopes: scopes,
		});
		if (!policy.effectiveScopes.includes("openid")) {
			oauthError(
				"invalid_scope",
				CIBA_ERROR_CODES.RESOURCE_DROPS_OPENID.message,
			);
		}
		const user = await ctx.context.internalAdapter.findUserById(request.userId);
		if (!user) {
			oauthError(
				"server_error",
				CIBA_ERROR_CODES.USER_NOT_FOUND.message,
				"INTERNAL_SERVER_ERROR",
			);
		}
		const claimed = await adapter.consumeOne<CibaRequest>({
			model: "cibaRequest",
			where: [
				...where,
				{ field: "status", value: "approved" },
				{ field: "expiresAt", operator: "gt", value: new Date() },
			],
		});
		if (!claimed) {
			if (request.expiresAt <= new Date()) {
				oauthError(
					"expired_token",
					CIBA_ERROR_CODES.EXPIRED_AUTH_REQ_ID.message,
				);
			}
			oauthError("invalid_grant", CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message);
		}

		return provider.issueTokens({
			client,
			scopes,
			user,
			resources,
			// The refresh token keeps every approved resource, not just this poll's.
			originalResources: approvedResources.length
				? approvedResources
				: undefined,
			referenceId: claimed.referenceId ?? undefined,
			authTime: claimed.authTime ?? undefined,
			// A DPoP proof on this poll, or a sender-constraint proved at client
			// authentication, binds the issued token.
			confirmation,
		});
	};
