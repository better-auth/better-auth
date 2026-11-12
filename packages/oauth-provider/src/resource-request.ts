import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import type { AccessTokenAuthorization } from "better-auth/oauth2";
import {
	createDpopReplayStore,
	createInsufficientScopeError,
	DPOP_SIGNING_ALGORITHMS,
	enforceDpopBinding,
	getDpopJktFromPayload,
	isDpopBindingError,
	parseAccessTokenAuthorization,
} from "better-auth/oauth2";
import {
	getDpopNonceOptions,
	getDpopProofJwt,
	getEndpointUrl,
	setDpopNonceHeader,
	withExposedHeaders,
} from "./dpop";
import { requireActiveAccessTokenWithClaims } from "./introspect";
import {
	buildMissingCredentialsChallenge,
	buildResourceServerChallenge,
} from "./resource-challenge";
import type {
	ActiveAccessTokenPayload,
	OAuthOptions,
	Scope,
	VerifyResourceRequestParams,
} from "./types";

/**
 * The exposed-header list with `WWW-Authenticate` added. Before hooks write to
 * the dispatch's `ctx.context.responseHeaders`, which the endpoint's own
 * `ctx.responseHeaders` does not include, and an error's header replaces the
 * value they accumulated, so both lists are kept here.
 */
function exposeChallengeHeader(
	ctx: GenericEndpointContext,
	challengeExposed?: string | null,
) {
	const scoped = ctx as GenericEndpointContext & {
		context: GenericEndpointContext["context"] & { responseHeaders?: Headers };
	};
	const names = [
		scoped.context.responseHeaders?.get("access-control-expose-headers"),
		ctx.responseHeaders?.get("access-control-expose-headers"),
		challengeExposed,
	].flatMap((value) => value?.split(",") ?? []);
	return withExposedHeaders(
		undefined,
		...names.map((name) => name.trim()).filter(Boolean),
		"WWW-Authenticate",
	);
}

/**
 * Only an origin-based resource has a derivable RFC 9728 metadata URL. For any
 * other identifier, the challenge omits `resource_metadata` instead of failing.
 */
function challengeResource(audience: string | undefined) {
	if (!audience || !URL.canParse(audience)) return undefined;
	return new URL(audience).origin === "null" ? undefined : audience;
}

/**
 * The access token in the `Authorization` header. RFC 6750 §3.1 treats an
 * authentication scheme this server does not support like no credentials.
 */
function headerAuthorization(ctx: GenericEndpointContext) {
	const authorization = parseAccessTokenAuthorization(
		ctx.headers?.get("authorization"),
	);
	return authorization?.scheme === "Unknown" ? null : authorization;
}

function invalidToken(description: string): APIError {
	return new APIError("UNAUTHORIZED", {
		message: description,
		error: "invalid_token",
		error_description: description,
	});
}

/**
 * Verifies the access token on this request in-process. See
 * `OAuthProviderApi.verifyResourceRequest`. UserInfo passes `authorization` to
 * accept the form-body token and keep its scheme-less fallback.
 */
export async function verifyResourceRequest(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	params: VerifyResourceRequestParams = {},
	authorization:
		| AccessTokenAuthorization
		| null
		| undefined = headerAuthorization(ctx),
): Promise<{
	payload: ActiveAccessTokenPayload;
	requestedUserInfoClaims: string[];
}> {
	if (params.audience !== undefined && !params.audience) {
		throw new TypeError("audience must be a non-empty resource identifier");
	}
	const resource = challengeResource(params.audience);
	const algorithms = opts.dpop?.signingAlgorithms ?? DPOP_SIGNING_ALGORITHMS;
	if (!authorization?.token) {
		throw new APIError(
			"UNAUTHORIZED",
			{ error_description: "access token not found", error: "invalid_request" },
			{
				"WWW-Authenticate": buildMissingCredentialsChallenge(
					resource,
					algorithms,
				),
				"Access-Control-Expose-Headers": exposeChallengeHeader(ctx),
			},
		);
	}

	try {
		const validated = await requireActiveAccessTokenWithClaims(
			ctx,
			opts,
			authorization.token,
		);
		const { payload } = validated;
		const boundToDpop = !!getDpopJktFromPayload(payload);

		// The DPoP `htm` check needs the real request method. Without a
		// `ctx.request` (a programmatic `auth.api` call) the sender-constraint
		// cannot be verified, so fail closed rather than assume a method.
		if (boundToDpop && !ctx.request) {
			throw invalidToken(
				"DPoP-bound access token requires an HTTP request context",
			);
		}
		const nonce = getDpopNonceOptions(ctx, opts);
		try {
			await enforceDpopBinding({
				payload,
				authorization,
				proofJwt: getDpopProofJwt(ctx),
				method: ctx.request?.method ?? "GET",
				url: getEndpointUrl(ctx, ctx.path ?? ""),
				proofMaxAgeSeconds: opts.dpop?.proofMaxAgeSeconds,
				signingAlgorithms: opts.dpop?.signingAlgorithms,
				replayStore: createDpopReplayStore(ctx.context.internalAdapter),
				nonce,
			});
		} catch (error) {
			if (!isDpopBindingError(error)) throw error;
			// RFC 9449 §9: a protected resource answers a missing or stale nonce
			// with a `DPoP` challenge and the nonce to retry with.
			const nonceHeaders =
				error.code === "use_dpop_nonce" && nonce
					? await setDpopNonceHeader(ctx, nonce, { challenge: true })
					: undefined;
			throw new APIError(
				"UNAUTHORIZED",
				{
					message: error.message,
					error: error.code,
					error_description: error.message,
				},
				nonceHeaders,
			);
		}
		// RFC 9449 §8.2: hand the client its next nonce with the response.
		if (nonce && boundToDpop) {
			await setDpopNonceHeader(ctx, nonce);
		}

		// RFC 9068 §4: the token must be issued for this resource.
		if (params.audience && ![payload.aud].flat().includes(params.audience)) {
			throw invalidToken("access token audience mismatch");
		}

		if (params.scopes?.length) {
			const granted = new Set(
				typeof payload.scope === "string" ? payload.scope.split(" ") : [],
			);
			// RFC 6750 §3.1: name every missing scope, so the client can request
			// them in one re-authorization.
			const missing = params.scopes.filter((scope) => !granted.has(scope));
			if (missing.length) throw createInsufficientScopeError(missing);
		}
		return validated;
	} catch (error) {
		const challenge = buildResourceServerChallenge(error, resource, {
			dpopSigningAlgorithms: algorithms,
			request: { authorizationHeader: ctx.headers?.get("authorization") },
		});
		if (!challenge) throw error;
		const headers = new Headers(challenge.headers);
		headers.set(
			"Access-Control-Expose-Headers",
			exposeChallengeHeader(ctx, headers.get("access-control-expose-headers")),
		);
		throw new APIError(challenge.status, challenge.body, headers);
	}
}
