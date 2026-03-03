/**
 * CIBA Push Token Delivery
 *
 * Per CIBA spec Section 10.3.1:
 * - POST to client_notification_endpoint
 * - Authorization: Bearer <client_notification_token>
 * - Body: token response with auth_req_id
 */

import type { GenericEndpointContext } from "@better-auth/core";
import { betterFetch } from "@better-fetch/fetch";
import { deleteCibaRequest } from "./storage";
import { generateTokensForCibaRequest } from "./token-utils";
import type { CibaRequestData } from "./types";

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

	try {
		// Generate tokens using shared utility
		const tokenResponse = await generateTokensForCibaRequest(ctx, cibaRequest);

		// POST to client notification endpoint per CIBA spec
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

		// Cleanup after successful delivery
		await deleteCibaRequest(ctx, cibaRequest.authReqId);
	} catch (_err) {
		ctx.context.logger.error(
			`CIBA push delivery error for auth_req_id=${cibaRequest.authReqId}`,
		);
	}
}
