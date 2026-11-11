import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, isAPIError } from "better-auth/api";
import {
	createDpopReplayStore,
	DPOP_SIGNING_ALGORITHMS,
	enforceDpopBinding,
	getDpopJktFromPayload,
	isDpopBindingError,
	parseAccessTokenAuthorization,
} from "better-auth/oauth2";
import type { User } from "better-auth/types";
import { getDpopProofJwt, getEndpointUrl, withExposedHeaders } from "./dpop";
import {
	collectExtensionUserInfoClaims,
	hasUserInfoClaimExtension,
} from "./extensions";
import { requireActiveAccessTokenWithClaims } from "./introspect";
import { buildDpopChallengeValue } from "./resource-challenge";
import { STANDARD_CLAIMS } from "./standard-claims";
import type { OAuthOptions, Scope } from "./types";
import { getClient, resolveSubjectIdentifier } from "./utils";

/**
 * Builds the standard OIDC claims (OIDC Core §5.1) for the UserInfo response.
 *
 * A claim is included when its backing scope was granted, or when it was named
 * individually through the `claims.userinfo` request parameter (§5.4, §5.5).
 * `sub` is always present. Values come from the one claim registry, so the
 * advertisement, the scope mapping, and the resolution cannot drift apart.
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#NormalClaims
 */
function userNormalClaims(
	user: User,
	scopes: string[],
	requestedClaims: string[] = [],
) {
	const requested = new Set(requestedClaims);
	const claims: Record<string, unknown> = { sub: user.id ?? undefined };
	for (const [name, definition] of Object.entries(STANDARD_CLAIMS)) {
		if (scopes.includes(definition.scope) || requested.has(name)) {
			claims[name] = definition.resolve(user);
		}
	}
	return claims;
}

/**
 * Returns the defined-valued entries of `claims`, dropping any key already
 * present in `base` when given.
 *
 * This is the two-tier claim authority shared by the /userinfo response and the
 * ID token:
 * - Called WITH `base` (the provider's own claims): the additive rule for
 *   third-party extension claims. A contributor may add new keys but never
 *   replace a claim the provider already owns.
 * - Called WITHOUT `base`: the deliberate first-party override path for the
 *   operator's own `customUserInfoClaims` / `customIdTokenClaims`, which is
 *   trusted to override identity claims (for example a formatted `name`). The
 *   caller re-pins `sub` afterwards, so subject integrity holds either way
 *   (OIDC Core §5.3.2: UserInfo `sub` MUST match the ID Token `sub`).
 */
export function pickClaims(
	claims?: Record<string, unknown>,
	base?: Record<string, unknown>,
) {
	const next: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(claims ?? {})) {
		if (value === undefined) continue;
		if (base && key in base) continue;
		next[key] = value;
	}
	return next;
}

function getUserInfoAccessToken(ctx: GenericEndpointContext) {
	const authorization = ctx.headers?.get("authorization");
	const headerAccessTokenAuthorization =
		parseAccessTokenAuthorization(authorization);
	const bodyToken =
		ctx.request?.method === "POST"
			? ((ctx.body as { access_token?: string } | undefined)?.access_token ??
				undefined)
			: undefined;

	if (headerAccessTokenAuthorization && bodyToken) {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"Multiple access token transport methods are not allowed",
			error: "invalid_request",
		});
	}

	const bodyAccessTokenAuthorization = bodyToken
		? { scheme: "Bearer" as const, token: bodyToken }
		: undefined;
	const accessTokenAuthorization =
		headerAccessTokenAuthorization ?? bodyAccessTokenAuthorization;

	return {
		authorization: accessTokenAuthorization,
		token: accessTokenAuthorization?.token,
	};
}

/**
 * The exposed-header list with `WWW-Authenticate` added. Before hooks write to
 * the dispatch's `ctx.context.responseHeaders`, which the endpoint's own
 * `ctx.responseHeaders` does not include, and an error's header replaces the
 * value they accumulated, so both lists are kept here.
 */
function exposeChallengeHeader(ctx: GenericEndpointContext) {
	const scoped = ctx as GenericEndpointContext & {
		context: GenericEndpointContext["context"] & { responseHeaders?: Headers };
	};
	const names = [scoped.context.responseHeaders, ctx.responseHeaders].flatMap(
		(headers) =>
			headers?.get("access-control-expose-headers")?.split(",") ?? [],
	);
	return withExposedHeaders(
		undefined,
		...names.map((name) => name.trim()).filter(Boolean),
		"WWW-Authenticate",
	);
}

/**
 * A 401 carrying `challenge`, which browsers hide from cross-origin clients
 * unless it is exposed.
 */
function unauthorized(
	ctx: GenericEndpointContext,
	body: { error: string; error_description: string },
	challenge: string,
) {
	return new APIError("UNAUTHORIZED", body, {
		"WWW-Authenticate": challenge,
		"Access-Control-Expose-Headers": exposeChallengeHeader(ctx),
	});
}

function dpopUnauthorized(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	error: string,
	description: string,
) {
	return unauthorized(
		ctx,
		{ error, error_description: description },
		buildDpopChallengeValue(error, description, opts.dpop?.signingAlgorithms),
	);
}

/**
 * Handles the /oauth2/userinfo endpoint.
 *
 * Every 401 carries a challenge (RFC 7235 §3.1): `DPoP` with the accepted
 * proof algorithms (RFC 9449 §7.1) when the token is DPoP-bound or the request
 * used the DPoP scheme, otherwise `Bearer` (RFC 6750 §3). A request without a
 * token is offered both schemes.
 */
export async function userInfoEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	// TODO: converge on parseBearerToken (utils) once we decide whether userinfo
	// should keep accepting a non-Bearer Authorization value as a bare token; the
	// shared parser is strict and would reject that fallback.
	const { authorization: accessTokenAuthorization } =
		getUserInfoAccessToken(ctx);
	if (!accessTokenAuthorization?.token) {
		// RFC 6750 §3.1: a request without credentials gets no error code.
		const algorithms = opts.dpop?.signingAlgorithms ?? DPOP_SIGNING_ALGORITHMS;
		throw unauthorized(
			ctx,
			{ error_description: "access token not found", error: "invalid_request" },
			`Bearer, DPoP algs="${algorithms.join(" ")}"`,
		);
	}
	const usesDpopScheme = accessTokenAuthorization.scheme === "DPoP";
	let validated: Awaited<ReturnType<typeof requireActiveAccessTokenWithClaims>>;
	try {
		validated = await requireActiveAccessTokenWithClaims(
			ctx,
			opts,
			accessTokenAuthorization.token,
		);
	} catch (error) {
		if (isAPIError(error) && error.status === "UNAUTHORIZED") {
			const body = error.body as
				| { error?: string; error_description?: string }
				| undefined;
			const code = body?.error ?? "invalid_token";
			const description = body?.error_description ?? error.message;
			if (usesDpopScheme) {
				throw dpopUnauthorized(ctx, opts, code, description);
			}
			throw unauthorized(
				ctx,
				{ error: code, error_description: description },
				new Headers(error.headers).get("WWW-Authenticate") ??
					`Bearer error="invalid_token"`,
			);
		}
		throw error;
	}
	const { payload: jwt, requestedUserInfoClaims: requestedClaims } = validated;

	// The DPoP `htm` check needs the real request method. Without a `ctx.request`
	// (a programmatic `auth.api` call) the sender-constraint cannot be verified,
	// so fail closed for a DPoP-bound token rather than assume "GET".
	if (getDpopJktFromPayload(jwt) && !ctx.request) {
		throw dpopUnauthorized(
			ctx,
			opts,
			"invalid_token",
			"DPoP-bound access token requires an HTTP request context",
		);
	}

	try {
		await enforceDpopBinding({
			payload: jwt,
			authorization: accessTokenAuthorization,
			proofJwt: getDpopProofJwt(ctx),
			method: ctx.request?.method ?? "GET",
			url: getEndpointUrl(ctx, "/oauth2/userinfo"),
			proofMaxAgeSeconds: opts.dpop?.proofMaxAgeSeconds,
			signingAlgorithms: opts.dpop?.signingAlgorithms,
			replayStore: createDpopReplayStore(ctx.context.internalAdapter),
		});
	} catch (error) {
		// Every binding failure means the token is DPoP-bound or the request
		// used the DPoP scheme, so it is challenged with DPoP.
		if (isDpopBindingError(error)) {
			throw dpopUnauthorized(ctx, opts, error.code, error.message);
		}
		throw error;
	}

	const scopes = (jwt.scope as string | undefined)?.split(" ");
	if (!scopes?.includes("openid")) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing required scope",
			error: "invalid_scope",
		});
	}

	if (!jwt.sub) {
		throw new APIError("BAD_REQUEST", {
			error_description: "user not found",
			error: "invalid_request",
		});
	}

	const user = await ctx.context.internalAdapter.findUserById(jwt.sub);
	if (!user) {
		throw new APIError("BAD_REQUEST", {
			error_description: "user not found",
			error: "invalid_request",
		});
	}

	const baseUserClaims = userNormalClaims(user, scopes ?? [], requestedClaims);
	const clientId = (jwt.client_id ?? jwt.azp) as string | undefined;
	// Load the client only when something needs it: pairwise subject resolution
	// or a UserInfo claim extension. The token was already validated against its
	// issuing client, so an unconditional lookup here would be redundant.
	const client =
		clientId && (opts.pairwiseSecret || hasUserInfoClaimExtension(opts))
			? await getClient(ctx, opts, clientId)
			: undefined;

	// Resolve pairwise sub if server has pairwise enabled and client is configured for it
	if (opts.pairwiseSecret && client) {
		baseUserClaims.sub = await resolveSubjectIdentifier(user.id, client, opts);
	}
	const extensionUserClaims = scopes?.length
		? await collectExtensionUserInfoClaims(opts, {
				ctx,
				opts,
				user,
				scopes,
				jwt,
				client: client ?? undefined,
				requestedClaims,
			})
		: {};
	const additionalInfoUserClaims =
		opts.customUserInfoClaims && scopes?.length
			? await opts.customUserInfoClaims({
					user,
					scopes,
					jwt,
					requestedClaims,
				})
			: {};
	return {
		...baseUserClaims,
		...pickClaims(extensionUserClaims, baseUserClaims),
		...pickClaims(additionalInfoUserClaims),
		sub: baseUserClaims.sub,
	};
}
