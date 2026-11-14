import type { GenericEndpointContext } from "@better-auth/core";
import { generateRandomString } from "better-auth/crypto";
import { APIError } from "better-call";
import { parseAuthorizationRequest } from "./authorize";
import { verifyEndpointDpopProof } from "./dpop";
import { getSignedQueryExpiresIn } from "./signed-query";
import { getOAuthProviderApi } from "./token";
import type { OAuthOptions, Scope } from "./types";
import { isRecord, storeToken, throwInvalidClient, tokenError } from "./utils";

export const PUSHED_AUTHORIZATION_REQUEST_PATH = "/oauth2/par";

/** RFC 9126 §2.2 recommends this URN prefix for `request_uri` values. */
const REQUEST_URI_PREFIX = "urn:ietf:params:oauth:request_uri:";

const DEFAULT_EXPIRES_IN = 60;

/** FAPI 2.0 requires a `request_uri` lifetime below 600 seconds. */
export const MAX_PUSHED_AUTHORIZATION_REQUEST_EXPIRES_IN = 600;

const STORED_TYPE = "pushed_authorization_request";

type StoredPushedAuthorizationRequest = {
	clientId: string;
	query: Record<string, unknown>;
	/** Set once `/oauth2/authorize` has loaded the request. */
	loaded?: true;
};

/**
 * Pushed requests get their own identifier namespace. Without it, a
 * `request_uri` and an authorization code hash to the same kind of
 * identifier, and presenting one where the other is expected would consume it.
 */
async function getStoredIdentifier(
	opts: OAuthOptions<Scope[]>,
	id: string,
): Promise<string> {
	return `${STORED_TYPE}:${await storeToken(opts.storeTokens, id, "request_uri")}`;
}

// Client authentication belongs to the push, not to the authorization request.
const CLIENT_AUTHENTICATION_PARAMETERS = [
	"client_secret",
	"client_assertion",
	"client_assertion_type",
] as const;

/** Copies `params` without the client authentication parameters. */
function withoutClientAuthentication(
	params: Record<string, unknown>,
): Record<string, unknown> {
	const copy = { ...params };
	for (const name of CLIENT_AUTHENTICATION_PARAMETERS) {
		delete copy[name];
	}
	return copy;
}

/**
 * Reads an authorization request that a client sends directly to the
 * authorization server, as at `/oauth2/par` (RFC 9126 §2.1). Authenticates
 * the client, after a DPoP nonce challenge so a nonce retry can resend a
 * one-time client assertion (RFC 9449 §8). Returns the request parameters
 * without client credentials and with the authenticated `client_id`; a
 * `client_id` naming another client fails with `invalid_client`.
 * `bindDpopProof` then verifies the request's DPoP proof, if any, and sets
 * `dpop_jkt` to its key (RFC 9449 §10). A proof from a key other than
 * `dpop_jkt` fails with `invalid_dpop_proof`.
 */
export async function authenticateAuthorizationRequest(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	body: Record<string, unknown>,
	requestUriErrorDescription: string,
) {
	const provider = getOAuthProviderApi(ctx, opts, "authorization_code");
	await provider.challengeDpopNonce();
	// Public clients identify themselves with client_id alone; confidential
	// clients must authenticate.
	const { clientId, method } = await provider.authenticateClient({
		requireCredentials: false,
	});

	const params = withoutClientAuthentication(body);
	if (params.request_uri !== undefined) {
		tokenError("BAD_REQUEST", "invalid_request", requestUriErrorDescription);
	}
	if (params.request !== undefined) {
		tokenError(
			"BAD_REQUEST",
			"request_not_supported",
			"request object not supported",
		);
	}
	if (params.client_id !== undefined && params.client_id !== clientId) {
		throwInvalidClient("client_id does not match the authenticated client", {
			method,
		});
	}
	params.client_id = clientId;

	const bindDpopProof = async (query: { dpop_jkt?: string }) => {
		// Checked as the token endpoint checks a code's key: before the nonce
		// and the `jti`, so a proof from another key is not used up.
		const proof = await verifyEndpointDpopProof(ctx, opts, {
			expectedJkt: query.dpop_jkt,
		});
		if (proof) query.dpop_jkt = proof.jkt;
	};
	return { clientId, params, bindDpopProof };
}

export function isPushedAuthorizationRequestEnabled(
	opts: OAuthOptions<Scope[]>,
): boolean {
	return (
		opts.pushedAuthorizationRequests?.enabled === true &&
		(!opts.grantTypes || opts.grantTypes.includes("authorization_code"))
	);
}

/**
 * `POST /oauth2/par` (RFC 9126 §2): authenticates the client, validates the
 * authorization request as `/oauth2/authorize` would, binds a DPoP key from
 * the request's proof (RFC 9449 §10.1), and stores the request under a
 * short-lived, single-use `request_uri`.
 */
export async function pushedAuthorizationRequestEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	if (!isPushedAuthorizationRequestEnabled(opts)) {
		throw new APIError("NOT_FOUND");
	}
	const { clientId, params, bindDpopProof } =
		await authenticateAuthorizationRequest(
			ctx,
			opts,
			isRecord(ctx.body) ? ctx.body : {},
			"request_uri must not be pushed",
		);
	await parseAuthorizationRequest(ctx, opts, params);
	await bindDpopProof(params);

	const id = generateRandomString(32, "a-z", "A-Z", "0-9");
	const expiresIn =
		opts.pushedAuthorizationRequests?.expiresIn ?? DEFAULT_EXPIRES_IN;
	const now = Date.now();
	// The raw parameters are stored so /oauth2/authorize validates them again,
	// as it does a front-channel request.
	await ctx.context.internalAdapter.createVerificationValue({
		identifier: await getStoredIdentifier(opts, id),
		value: JSON.stringify({
			clientId,
			query: params,
		} satisfies StoredPushedAuthorizationRequest),
		createdAt: new Date(now),
		updatedAt: new Date(now),
		expiresAt: new Date(now + expiresIn * 1000),
	});
	ctx.setStatus(201);
	return ctx.json({
		request_uri: `${REQUEST_URI_PREFIX}${id}`,
		expires_in: expiresIn,
	});
}

export type PushedAuthorizationRequestLookup =
	/** The value was not issued by this endpoint, it expired, or it was used. */
	| { status: "not_found" }
	/** The value was issued to another client; it is discarded regardless. */
	| { status: "invalid" }
	| { status: "found"; query: Record<string, unknown> };

async function getRequestUriIdentifier(
	opts: OAuthOptions<Scope[]>,
	requestUri: string,
): Promise<string | undefined> {
	if (!requestUri.startsWith(REQUEST_URI_PREFIX)) return undefined;
	return getStoredIdentifier(opts, requestUri.slice(REQUEST_URI_PREFIX.length));
}

/**
 * Loads a `request_uri` issued by {@link pushedAuthorizationRequestEndpoint}
 * for the client that pushed it, without using it up, so the user agent can
 * reload the authorization URL (RFC 9126 §4). The first load extends the
 * value's lifetime to that of the signed query that carries the request
 * through login and consent, so a sign-in that outlasts `expires_in` can still
 * finish. {@link consumePushedAuthorizationRequest} uses it up when the code is
 * issued.
 */
export async function loadPushedAuthorizationRequest(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	requestUri: string,
	clientId: string,
): Promise<PushedAuthorizationRequestLookup> {
	const identifier = await getRequestUriIdentifier(opts, requestUri);
	if (!identifier) return { status: "not_found" };
	const { internalAdapter } = ctx.context;
	const verification = await internalAdapter.findVerificationValue(identifier);
	const now = Date.now();
	if (!verification || new Date(verification.expiresAt).getTime() <= now) {
		return { status: "not_found" };
	}
	const stored: StoredPushedAuthorizationRequest = JSON.parse(
		verification.value,
	);
	if (stored.clientId !== clientId) {
		await internalAdapter.deleteVerificationByIdentifier(identifier);
		return { status: "invalid" };
	}
	if (!stored.loaded) {
		await internalAdapter.updateVerificationByIdentifier(identifier, {
			value: JSON.stringify({
				...stored,
				loaded: true,
			} satisfies StoredPushedAuthorizationRequest),
			expiresAt: new Date(now + getSignedQueryExpiresIn(opts) * 1000),
		});
	}
	return { status: "found", query: stored.query };
}

/**
 * Uses up a `request_uri` that {@link loadPushedAuthorizationRequest} loaded.
 * Returns false when another request already used it or it expired, so one
 * pushed request issues at most one authorization code.
 */
export async function consumePushedAuthorizationRequest(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	requestUri: string,
): Promise<boolean> {
	const identifier = await getRequestUriIdentifier(opts, requestUri);
	if (!identifier) return false;
	return !!(await ctx.context.internalAdapter.consumeVerificationValue(
		identifier,
	));
}
