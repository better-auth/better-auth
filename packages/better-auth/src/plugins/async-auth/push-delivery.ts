/**
 * Push Token Delivery (CIBA spec)
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
import { deleteAsyncAuthRequest } from "./storage";
import { generateTokensForAsyncAuthRequest } from "./token-utils";
import type { AsyncAuthRequestData } from "./types";

/**
 * Validate that a URL uses HTTPS (CIBA spec §10.3).
 * Loopback addresses (localhost, 127.0.0.1, ::1) are exempt per standard
 * practice for local development.
 */
export function isSecureEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		// URL.hostname returns "[::1]" for IPv6 loopback (brackets included)
		const isLoopback =
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "[::1]";
		return url.protocol === "https:" || isLoopback;
	} catch {
		return false;
	}
}

/**
 * Re-verify that the client is still valid and not disabled before
 * delivering tokens. Guards against the window between approval and delivery
 * where the client could have been disabled.
 *
 * Returns: true = valid, false = disabled/not found, null = transient error
 */
async function verifyClientStillValid(
	ctx: GenericEndpointContext,
	clientId: string,
): Promise<boolean | null> {
	const { trustedClients, pluginId } = getOidcPluginContext(ctx);

	const trusted = trustedClients?.find((c) => c.clientId === clientId);
	if (trusted) {
		return !trusted.disabled;
	}

	const modelName =
		pluginId === "oidc-provider" ? "oauthApplication" : "oauthClient";
	let dbClient: MinimalClient | null;
	try {
		dbClient =
			(await ctx.context.adapter.findOne<MinimalClient>({
				model: modelName,
				where: [{ field: "clientId", value: clientId }],
			})) ?? null;
	} catch {
		return null;
	}

	return !!dbClient && !dbClient.disabled;
}

/**
 * Push tokens to the client's notification endpoint.
 * Called after user approves an async auth request in push mode.
 *
 * If delivery fails, the error is logged but the request is NOT deleted —
 * this is intentional. The tokens are lost and the client has no retry mechanism
 * per the CIBA spec (push mode is fire-and-forget from the AS perspective).
 * A retry/dead-letter mechanism could be added as a future enhancement.
 */
export async function pushTokensToClient(
	ctx: GenericEndpointContext,
	asyncAuthRequest: AsyncAuthRequestData,
): Promise<void> {
	if (
		!asyncAuthRequest.clientNotificationEndpoint ||
		!asyncAuthRequest.clientNotificationToken
	) {
		ctx.context.logger.error(
			"Async auth push delivery missing endpoint or notification token",
		);
		return;
	}

	if (!isSecureEndpoint(asyncAuthRequest.clientNotificationEndpoint)) {
		ctx.context.logger.error(
			`Async auth push delivery rejected: notification endpoint must use HTTPS (got ${asyncAuthRequest.clientNotificationEndpoint})`,
		);
		return;
	}

	const clientValid = await verifyClientStillValid(
		ctx,
		asyncAuthRequest.clientId,
	);
	if (clientValid === null) {
		ctx.context.logger.error(
			`Async auth push delivery deferred: could not verify client ${asyncAuthRequest.clientId} (transient error). Request preserved for retry.`,
		);
		return;
	}
	if (!clientValid) {
		ctx.context.logger.error(
			`Async auth push delivery aborted: client ${asyncAuthRequest.clientId} is disabled or no longer exists`,
		);
		await deleteAsyncAuthRequest(ctx, asyncAuthRequest.authReqId);
		return;
	}

	try {
		const tokenResponse = await generateTokensForAsyncAuthRequest(
			ctx,
			asyncAuthRequest,
		);

		const { error } = await betterFetch(
			asyncAuthRequest.clientNotificationEndpoint,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${asyncAuthRequest.clientNotificationToken}`,
				},
				body: {
					auth_req_id: asyncAuthRequest.authReqId,
					...tokenResponse,
				},
			},
		);

		if (error) {
			ctx.context.logger.error(
				`Async auth push delivery failed for auth_req_id=${asyncAuthRequest.authReqId}:`,
				error,
			);
			return;
		}

		await deleteAsyncAuthRequest(ctx, asyncAuthRequest.authReqId);
	} catch (err) {
		ctx.context.logger.error(
			`Async auth push delivery error for auth_req_id=${asyncAuthRequest.authReqId}:`,
			err,
		);
	}
}
