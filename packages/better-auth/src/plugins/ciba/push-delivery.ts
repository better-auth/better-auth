/**
 * CIBA Push Token Delivery
 *
 * Per CIBA spec Section 10.3.1:
 * - POST to client_notification_endpoint
 * - Authorization: Bearer <client_notification_token>
 * - Body: token response with auth_req_id
 *
 * Section 10.3 requires the notification endpoint to use TLS.
 */

import type { GenericEndpointContext } from "@better-auth/core";
import { betterFetch } from "@better-fetch/fetch";
import type { MinimalClient } from "./client-auth";
import { getOidcPluginContext } from "./client-auth";
import { deleteCibaRequest } from "./storage";
import { generateTokensForCibaRequest } from "./token-utils";
import type { CibaRequestData } from "./types";

/**
 * Validate that the notification endpoint uses HTTPS (CIBA spec §10.3).
 * Loopback addresses (localhost, 127.0.0.1, ::1) are exempt.
 */
function isSecureEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		const isLoopback =
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "::1";
		return url.protocol === "https:" || isLoopback;
	} catch {
		return false;
	}
}

/**
 * Re-verify that the client is still valid and not disabled before
 * delivering tokens. Guards against the window between approval and delivery
 * where the client could have been disabled.
 */
async function verifyClientStillValid(
	ctx: GenericEndpointContext,
	clientId: string,
): Promise<boolean> {
	const { trustedClients, pluginId } = getOidcPluginContext(ctx);

	const trusted = trustedClients?.find((c) => c.clientId === clientId);
	if (trusted) {
		return !trusted.disabled;
	}

	const modelName =
		pluginId === "oidc-provider" ? "oauthApplication" : "oauthClient";
	const dbClient = await ctx.context.adapter
		.findOne<MinimalClient>({
			model: modelName,
			where: [{ field: "clientId", value: clientId }],
		})
		.catch(() => null);

	return !!dbClient && !dbClient.disabled;
}

/**
 * Push tokens to the client's notification endpoint.
 * Called after user approves a CIBA request in push mode.
 */
export async function pushTokensToClient(
	ctx: GenericEndpointContext,
	cibaRequest: CibaRequestData,
): Promise<void> {
	if (
		!cibaRequest.clientNotificationEndpoint ||
		!cibaRequest.clientNotificationToken
	) {
		ctx.context.logger.error(
			"CIBA push delivery missing endpoint or notification token",
		);
		return;
	}

	if (!isSecureEndpoint(cibaRequest.clientNotificationEndpoint)) {
		ctx.context.logger.error(
			`CIBA push delivery rejected: notification endpoint must use HTTPS (got ${cibaRequest.clientNotificationEndpoint})`,
		);
		return;
	}

	const clientValid = await verifyClientStillValid(ctx, cibaRequest.clientId);
	if (!clientValid) {
		ctx.context.logger.error(
			`CIBA push delivery aborted: client ${cibaRequest.clientId} is disabled or no longer exists`,
		);
		await deleteCibaRequest(ctx, cibaRequest.authReqId);
		return;
	}

	try {
		const tokenResponse = await generateTokensForCibaRequest(ctx, cibaRequest);

		const { error } = await betterFetch(
			cibaRequest.clientNotificationEndpoint,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${cibaRequest.clientNotificationToken}`,
				},
				body: {
					auth_req_id: cibaRequest.authReqId,
					...tokenResponse,
				},
			},
		);

		if (error) {
			ctx.context.logger.error(
				`CIBA push delivery failed for auth_req_id=${cibaRequest.authReqId}`,
			);
			return;
		}

		await deleteCibaRequest(ctx, cibaRequest.authReqId);
	} catch (_err) {
		ctx.context.logger.error(
			`CIBA push delivery error for auth_req_id=${cibaRequest.authReqId}`,
		);
	}
}
