import type { GenericEndpointContext } from "@better-auth/core";
import { assertPublicRoutableHttpsUri } from "@better-auth/oauth-provider/internal";
import { symmetricDecrypt } from "better-auth/crypto";
import { oauthError } from "./error-codes";
import type { CibaRequest } from "./schema";
import type { CibaDeliveryMode } from "./types";

/** CIBA §4 client registration metadata, stored in the client's `metadata`. */
export const DELIVERY_MODE_FIELD = "backchannel_token_delivery_mode";
export const NOTIFICATION_ENDPOINT_FIELD =
	"backchannel_client_notification_endpoint";

// Matches the back-channel logout dispatch timeout.
const PING_TIMEOUT_MS = 5_000;

export type CibaDelivery =
	| { mode: "poll" }
	| { mode: "ping"; notificationEndpoint: string };

/**
 * Reads a client's CIBA delivery settings (CIBA §4) and throws
 * `invalid_client_metadata` unless this server supports the mode and, for
 * ping, may POST to the notification endpoint: absolute https, no credentials
 * or fragment, and a public host, the same rules as `backchannel_logout_uri`.
 */
export function resolveCibaDelivery(
	metadata: Record<string, unknown> | undefined,
	deliveryModes: CibaDeliveryMode[],
): CibaDelivery {
	const mode = metadata?.[DELIVERY_MODE_FIELD];
	if (mode === "poll" && deliveryModes.includes(mode)) return { mode };
	if (mode === "ping" && deliveryModes.includes(mode)) {
		const notificationEndpoint = metadata?.[NOTIFICATION_ENDPOINT_FIELD];
		if (typeof notificationEndpoint !== "string") {
			oauthError(
				"invalid_client_metadata",
				`${NOTIFICATION_ENDPOINT_FIELD} is required for ping delivery`,
			);
		}
		assertPublicRoutableHttpsUri(
			NOTIFICATION_ENDPOINT_FIELD,
			notificationEndpoint,
		);
		return { mode, notificationEndpoint };
	}
	return oauthError(
		"invalid_client_metadata",
		`${DELIVERY_MODE_FIELD} must be one of: ${deliveryModes.join(", ")}`,
	);
}

/**
 * Ping callback (CIBA §10.2): tells a ping-mode client that the user decided,
 * so it polls the token endpoint. One attempt, off the response path when a
 * background handler is configured. The decision is already recorded, so a
 * failure is only logged, and the client can still poll.
 */
export async function pingClient(
	ctx: GenericEndpointContext,
	request: CibaRequest,
): Promise<void> {
	const {
		clientNotificationEndpoint: endpoint,
		clientNotificationToken: token,
		encryptedAuthReqId,
	} = request;
	if (!endpoint || !token || !encryptedAuthReqId) return;
	const ping = (async () => {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				auth_req_id: await symmetricDecrypt({
					key: ctx.context.secretConfig,
					data: encryptedAuthReqId,
				}),
			}),
			signal: AbortSignal.timeout(PING_TIMEOUT_MS),
			redirect: "error",
		});
		if (!response.ok) {
			ctx.context.logger.warn(
				`CIBA ping to client ${request.clientId} returned ${response.status}`,
			);
		}
	})().catch((error: unknown) => {
		ctx.context.logger.warn(
			`CIBA ping to client ${request.clientId} failed`,
			error,
		);
	});
	await ctx.context.runInBackgroundOrAwait(ping);
}
