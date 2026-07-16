import type { GenericEndpointContext } from "@better-auth/core";
import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { BetterAuthError } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import { DELIVERY_MODE_METADATA_KEY } from "./constants";
import type { CibaOptions } from "./types";

export type CibaStatus = "pending" | "approved" | "rejected";

export type CibaDeliveryMode = "poll" | "ping" | "push";

export interface CibaRequest {
	id: string;
	/** SHA-256 hash of the raw auth_req_id (see {@link hashAuthReqId}). */
	authReqId: string;
	clientId: string;
	userId: string;
	scope: string;
	bindingMessage?: string;
	/** RFC 9396 Rich Authorization Requests, stored as the raw JSON string. */
	authorizationDetails?: string;
	/** RFC 8707 resource indicator the issued token is bound to. */
	resource?: string;
	/** Requested `acr_values` (OIDC §3.1.2.1, space-delimited). */
	acrValues?: string;
	/** Deployment-stamped authentication-context identifier (opaque). */
	authContextId?: string;
	status: CibaStatus;
	/** CIBA token delivery mode (CIBA §4). */
	deliveryMode: CibaDeliveryMode;
	/** Bearer token for ping/push notification delivery (CIBA §7.1). */
	clientNotificationToken?: string;
	/** Resolved HTTPS endpoint for ping/push delivery (CIBA §10.2). */
	clientNotificationEndpoint?: string;
	/** When the user approved, used as the ID token `auth_time` (OIDC Core §2). */
	approvedAt?: Date;
	pollingInterval: number;
	lastPolledAt?: Date;
	expiresAt: Date;
	createdAt: Date;
}

/**
 * Resolves the OAuth provider's options from the request context. CIBA depends
 * on the oauth-provider plugin; its absence is a configuration error caught at
 * startup by `extendOAuthProvider`, so reaching here without it is unexpected.
 */
export function getOAuthOptions(
	ctx: GenericEndpointContext,
): OAuthOptions<Scope[]> {
	const provider = ctx.context.getPlugin("oauth-provider");
	if (!provider) {
		throw new BetterAuthError(
			"The CIBA plugin requires the oauth-provider plugin",
		);
	}
	return provider.options as OAuthOptions<Scope[]>;
}

/** Generates a raw auth_req_id with ~190 bits of entropy (CIBA §7.3). */
export function generateAuthReqId(): string {
	return generateRandomString(32, "a-z", "A-Z", "0-9");
}

/**
 * Hashes a raw auth_req_id for storage and lookup, using the same SHA-256 +
 * base64url scheme the OAuth provider uses for tokens. The raw value is a bearer
 * credential, so only the hash is ever persisted.
 */
export async function hashAuthReqId(authReqId: string): Promise<string> {
	const digest = await createHash("SHA-256").digest(
		new TextEncoder().encode(authReqId),
	);
	return base64Url.encode(new Uint8Array(digest), { padding: false });
}

export async function findCibaRequestByHash(
	ctx: GenericEndpointContext,
	authReqIdHash: string,
): Promise<CibaRequest | null> {
	return ctx.context.adapter.findOne<CibaRequest>({
		model: "cibaRequest",
		where: [{ field: "authReqId", value: authReqIdHash }],
	});
}

/**
 * Looks up a request by its primary id. Used by the session-authenticated
 * approval endpoints, where a first-party UI references a request it owns by id
 * rather than by the raw `auth_req_id` (which it never holds, since only the
 * hash is stored).
 */
export async function findCibaRequestById(
	ctx: GenericEndpointContext,
	id: string,
): Promise<CibaRequest | null> {
	return ctx.context.adapter.findOne<CibaRequest>({
		model: "cibaRequest",
		where: [{ field: "id", value: id }],
	});
}

/** Applies a single-row update keyed on the primary id (no compare-and-swap). */
export async function updateCibaRequest(
	ctx: GenericEndpointContext,
	id: string,
	update: Partial<CibaRequest>,
): Promise<void> {
	await ctx.context.adapter.update({
		model: "cibaRequest",
		where: [{ field: "id", value: id }],
		update,
	});
}

/**
 * Atomically claims an approved request for redemption: deletes it and returns
 * the deleted row, or `null` if it was not approved or another poll already
 * claimed it. This is the single race gate for token issuance, so concurrent
 * polls cannot both mint a token set (adapter `consumeOne`, the documented
 * race-safe single-use primitive).
 */
export async function consumeApprovedCibaRequest(
	ctx: GenericEndpointContext,
	params: { id: string; clientId: string },
): Promise<CibaRequest | null> {
	return ctx.context.adapter.consumeOne<CibaRequest>({
		model: "cibaRequest",
		where: [
			{ field: "id", value: params.id },
			{ field: "clientId", value: params.clientId },
			{ field: "status", value: "approved" },
		],
	});
}

/**
 * Atomically claims a still-pending request for immediate redemption: deletes it
 * and returns the deleted row, or `null` if it was already approved, rejected, or
 * claimed by a concurrent caller. Used by push/ping approval, where the token is
 * minted inline at approval rather than at a later poll, so the same single-use
 * gate that protects poll issuance also protects push issuance.
 */
export async function consumePendingCibaRequest(
	ctx: GenericEndpointContext,
	id: string,
): Promise<CibaRequest | null> {
	return ctx.context.adapter.consumeOne<CibaRequest>({
		model: "cibaRequest",
		where: [
			{ field: "id", value: id },
			{ field: "status", value: "pending" },
		],
	});
}

export async function deleteCibaRequest(
	ctx: GenericEndpointContext,
	id: string,
): Promise<void> {
	await ctx.context.adapter.delete({
		model: "cibaRequest",
		where: [{ field: "id", value: id }],
	});
}

/**
 * Validates that a client notification endpoint uses TLS (CIBA §10.2). Loopback
 * hosts are exempt for local development (RFC 8252 §8.3).
 */
export function isSecureEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
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
 * Atomically raises the stored polling interval (the `slow_down` ratchet). Uses
 * the guarded-counter primitive so concurrent slow polls cannot lose the
 * increment (CIBA §11: the interval increases for this and subsequent requests).
 */
export async function ratchetPollingInterval(
	ctx: GenericEndpointContext,
	id: string,
	by: number,
): Promise<void> {
	await ctx.context.adapter.incrementOne({
		model: "cibaRequest",
		where: [{ field: "id", value: id }],
		increment: { pollingInterval: by },
	});
}

/**
 * Extra token contributions for a CIBA issuance: per-issuance JWT access-token
 * claims and extra token-response envelope fields.
 */
export interface CibaIssuanceExtras {
	accessTokenClaims: Record<string, unknown>;
	tokenResponse: Record<string, unknown>;
	/** RFC 8707 resource indicator to bind the issued token to, if any. */
	resources?: string[];
}

/**
 * Builds the extra token contributions shared by both issuance paths (poll at
 * the token endpoint, push at approval):
 *
 * - `authorization_details` (RFC 9396 RAR) in both the access token and the
 *   token response, round-tripped from the stored request.
 * - the RFC 8707 `resource` the token is bound to, if any.
 * - any deployment-supplied claims from {@link CibaOptions.buildAccessTokenClaims}.
 *
 * `act.sub` is contributed separately by the extension's grant-type-stable
 * `claims.accessToken` contributor, so it also survives opaque introspection and
 * is not set here. Malformed stored RAR JSON is skipped rather than failing
 * issuance.
 */
export async function buildCibaIssuanceExtras(
	ctx: GenericEndpointContext,
	options: CibaOptions,
	request: CibaRequest,
): Promise<CibaIssuanceExtras> {
	const extras: CibaIssuanceExtras = {
		accessTokenClaims: {},
		tokenResponse: {},
	};

	if (request.authorizationDetails) {
		try {
			const parsed: unknown = JSON.parse(request.authorizationDetails);
			extras.accessTokenClaims.authorization_details = parsed;
			extras.tokenResponse.authorization_details = parsed;
		} catch {
			// Malformed RAR JSON: issue without authorization_details.
		}
	}

	if (request.resource) {
		extras.resources = [request.resource];
	}

	if (options.buildAccessTokenClaims) {
		const custom = await options.buildAccessTokenClaims(request, ctx);
		Object.assign(extras.accessTokenClaims, custom);
	}

	return extras;
}

/**
 * Reads a client's registered `backchannel_token_delivery_mode` from its stored
 * metadata, tolerating the JSON-string or already-parsed object shapes adapters
 * return.
 */
export function getClientDeliveryMode(client: {
	metadata?: unknown;
}): string | undefined {
	const raw = client.metadata;
	let meta: Record<string, unknown> | undefined;
	if (typeof raw === "string") {
		try {
			meta = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			meta = undefined;
		}
	} else if (raw && typeof raw === "object") {
		meta = raw as Record<string, unknown>;
	}
	const mode = meta?.[DELIVERY_MODE_METADATA_KEY];
	return typeof mode === "string" ? mode : undefined;
}
