import type { GenericEndpointContext } from "@better-auth/core";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";
import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import { parseClientMetadata } from "@better-auth/oauth-provider/internal";
import { BetterAuthError } from "better-auth";
import { CIBA_GRANT_TYPE } from "./constants";
import type { CibaDeliveryMode } from "./types";

export interface CibaRequest {
	id: string;
	/** The hashed `auth_req_id`. */
	authReqId: string;
	clientId: string;
	userId: string;
	scope: string;
	bindingMessage?: string | null;
	resources?: string[] | null;
	status: "pending" | "approved" | "denied";
	clientNotificationToken?: string | null;
	authTime?: Date | null;
	/** Milliseconds. */
	pollingInterval: number;
	lastPolledAt?: Date | null;
	expiresAt: Date;
	createdAt: Date;
}

// Matches the back-channel logout dispatch timeout.
const NOTIFICATION_TIMEOUT_MS = 5_000;

/**
 * The OAuth provider's options. `extendOAuthProvider` fails at startup without
 * the provider, so a missing plugin here is a programming error.
 */
export function getOAuthOptions(
	ctx: GenericEndpointContext,
): OAuthOptions<Scope[]> {
	const provider = ctx.context.getPlugin("oauth-provider");
	if (!provider) {
		throw new BetterAuthError("The CIBA plugin requires oauthProvider()");
	}
	return provider.options as OAuthOptions<Scope[]>;
}

export function getCibaProviderApi(ctx: GenericEndpointContext) {
	return getOAuthProviderApi(ctx, getOAuthOptions(ctx), CIBA_GRANT_TYPE);
}

/** Looks up a request by the raw `auth_req_id` the client or approval link holds. */
export async function findCibaRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
): Promise<CibaRequest | null> {
	return ctx.context.adapter.findOne<CibaRequest>({
		model: "cibaRequest",
		where: [
			{
				field: "authReqId",
				value: await hashAuthReqId(ctx, authReqId),
			},
		],
	});
}

export async function hashAuthReqId(
	ctx: GenericEndpointContext,
	authReqId: string,
): Promise<string> {
	return getCibaProviderApi(ctx).hashToken(authReqId, "auth_req_id");
}

/**
 * Reads the CIBA registration metadata (CIBA §4) from the client's stored
 * metadata. The notification endpoint is returned only when it is safe for the
 * server to POST to: absolute https, no credentials or fragment, and a publicly
 * routable host, the same rules as `backchannel_logout_uri`.
 */
export function getCibaClientMetadata(client: {
	metadata?: string | object | null;
}): {
	deliveryMode: string | undefined;
	notificationEndpoint: string | undefined;
} {
	const metadata = parseClientMetadata(client.metadata ?? undefined);
	const deliveryMode = metadata?.backchannel_token_delivery_mode;
	const endpoint = metadata?.backchannel_client_notification_endpoint;
	return {
		deliveryMode: typeof deliveryMode === "string" ? deliveryMode : undefined,
		notificationEndpoint:
			typeof endpoint === "string" && isSafeNotificationEndpoint(endpoint)
				? endpoint
				: undefined,
	};
}

function isSafeNotificationEndpoint(endpoint: string): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	return (
		url.protocol === "https:" &&
		!endpoint.includes("#") &&
		!url.username &&
		!url.password &&
		isPublicRoutableHost(url.hostname)
	);
}

export function isSupportedDeliveryMode(
	mode: string | undefined,
	supported: CibaDeliveryMode[],
): mode is CibaDeliveryMode {
	return supported.includes(mode as CibaDeliveryMode);
}

/**
 * Ping callback (CIBA §10.2): tells the client its request finished, approved
 * or denied, so it polls the token endpoint. One attempt, off the response path
 * when a background handler is configured; failures are logged, since the
 * client can still poll.
 */
export async function pingClient(
	ctx: GenericEndpointContext,
	request: CibaRequest,
	authReqId: string,
): Promise<void> {
	if (!request.clientNotificationToken) return;
	// The decision is already committed, so a failed lookup must not fail it.
	let endpoint: string | undefined;
	try {
		const client = await getCibaProviderApi(ctx).getClient(request.clientId);
		endpoint = client
			? getCibaClientMetadata(client).notificationEndpoint
			: undefined;
	} catch (error) {
		ctx.context.logger.warn(
			`CIBA ping skipped: could not load client ${request.clientId}`,
			error,
		);
		return;
	}
	if (!endpoint) {
		ctx.context.logger.warn(
			`CIBA ping skipped: client ${request.clientId} has no valid notification endpoint`,
		);
		return;
	}
	const delivery = fetch(endpoint, {
		method: "POST",
		headers: {
			authorization: `Bearer ${request.clientNotificationToken}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ auth_req_id: authReqId }),
		signal: AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS),
		redirect: "error",
	}).then(
		(response) => {
			if (!response.ok) {
				ctx.context.logger.warn(
					`CIBA ping to client ${request.clientId} returned ${response.status}`,
				);
			}
		},
		(error: unknown) => {
			ctx.context.logger.warn(
				`CIBA ping to client ${request.clientId} failed`,
				error,
			);
		},
	);
	await ctx.context.runInBackgroundOrAwait(delivery);
}
