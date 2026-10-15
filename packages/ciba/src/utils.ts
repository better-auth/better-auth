import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthClientMetadataExtensionInput,
	OAuthOptions,
	Scope,
} from "@better-auth/oauth-provider";
import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import {
	assertPublicRoutableHttpsUri,
	parseClientMetadata,
} from "@better-auth/oauth-provider/internal";
import { BetterAuthError } from "better-auth";
import { APIError } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import { CIBA_GRANT_TYPE } from "./constants";
import type { CibaDeliveryMode, CibaRequest } from "./types";

/** The stored row, including fields hooks never see. */
export interface StoredCibaRequest extends CibaRequest {
	clientNotificationToken?: string | null;
	encryptedAuthReqId?: string | null;
	/** Milliseconds. */
	pollingInterval: number;
	lastPolledAt?: Date | null;
}

/** Identifies a request by the raw `auth_req_id` or by its internal id. */
export type CibaRequestIdentifier =
	| { authReqId: string; requestId?: undefined }
	| { requestId: string; authReqId?: undefined };

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

export async function findCibaRequest(
	ctx: GenericEndpointContext,
	identifier: CibaRequestIdentifier,
): Promise<StoredCibaRequest | null> {
	return ctx.context.adapter.findOne<StoredCibaRequest>({
		model: "cibaRequest",
		where: [
			identifier.requestId !== undefined
				? { field: "id", value: identifier.requestId }
				: {
						field: "authReqId",
						value: await hashAuthReqId(ctx, identifier.authReqId),
					},
		],
	});
}

/** Strips the fields only the plugin reads before a row reaches a hook. */
export function toCibaRequest({
	clientNotificationToken: _token,
	encryptedAuthReqId: _encrypted,
	pollingInterval: _interval,
	lastPolledAt: _lastPolled,
	...request
}: StoredCibaRequest): CibaRequest {
	return request;
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
	const deliveryMode = metadata?.[DELIVERY_MODE_FIELD];
	const endpoint = metadata?.[NOTIFICATION_ENDPOINT_FIELD];
	return {
		deliveryMode: typeof deliveryMode === "string" ? deliveryMode : undefined,
		notificationEndpoint:
			typeof endpoint === "string" && isSafeNotificationEndpoint(endpoint)
				? endpoint
				: undefined,
	};
}

function isSafeNotificationEndpoint(endpoint: string): boolean {
	try {
		assertPublicRoutableHttpsUri(NOTIFICATION_ENDPOINT_FIELD, endpoint);
		return true;
	} catch {
		return false;
	}
}

/** CIBA §4 registration metadata, stored in the client's `metadata`. */
export const DELIVERY_MODE_FIELD = "backchannel_token_delivery_mode";
export const NOTIFICATION_ENDPOINT_FIELD =
	"backchannel_client_notification_endpoint";

/**
 * Validates a CIBA client's registration metadata (CIBA §4) when it registers
 * or an admin changes it: a supported delivery mode, and for ping an endpoint
 * the server may POST to.
 */
export function validateCibaClientMetadata(
	input: OAuthClientMetadataExtensionInput,
	supported: CibaDeliveryMode[],
): void {
	if (!input.client.grant_types?.includes(CIBA_GRANT_TYPE)) return;
	const reject = (description: string): never => {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description: description,
		});
	};
	const mode = input.metadata[DELIVERY_MODE_FIELD];
	if (typeof mode !== "string" || !isSupportedDeliveryMode(mode, supported)) {
		reject(`${DELIVERY_MODE_FIELD} must be one of: ${supported.join(", ")}`);
	}
	if (mode === "ping") {
		const endpoint = input.metadata[NOTIFICATION_ENDPOINT_FIELD];
		if (typeof endpoint !== "string") {
			reject(`${NOTIFICATION_ENDPOINT_FIELD} is required for ping delivery`);
		}
		assertPublicRoutableHttpsUri(
			NOTIFICATION_ENDPOINT_FIELD,
			endpoint as string,
		);
	}
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
	request: StoredCibaRequest,
): Promise<void> {
	if (!request.clientNotificationToken || !request.encryptedAuthReqId) return;
	// The decision is already committed, so a failed lookup must not fail it.
	let endpoint: string | undefined;
	let authReqId: string;
	try {
		const client = await getCibaProviderApi(ctx).getClient(request.clientId);
		endpoint = client
			? getCibaClientMetadata(client).notificationEndpoint
			: undefined;
		authReqId = await symmetricDecrypt({
			key: ctx.context.secretConfig,
			data: request.encryptedAuthReqId,
		});
	} catch (error) {
		ctx.context.logger.warn(
			`CIBA ping skipped: could not prepare the ping for client ${request.clientId}`,
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
