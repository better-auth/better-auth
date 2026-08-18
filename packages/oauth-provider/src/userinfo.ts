import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import {
	createDpopReplayStore,
	enforceDpopBinding,
	getDpopJktFromPayload,
	isDpopBindingError,
	parseAccessTokenAuthorization,
} from "better-auth/oauth2";
import type { User } from "better-auth/types";
import { getDpopProofJwt, getEndpointUrl } from "./dpop";
import {
	collectExtensionUserInfoClaims,
	hasUserInfoClaimExtension,
} from "./extensions";
import { requireActiveAccessTokenWithClaims } from "./introspect";
import { STANDARD_CLAIMS } from "./standard-claims";
import type { OAuthOptions, SchemaClient, Scope } from "./types";
import {
	applyPairwiseSubject,
	getClient,
	resolvedSubjectClaim,
	resolveSubjectIdentifier,
} from "./utils";

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
 * Resolves the subject to present at /userinfo, which OIDC Core §5.3.2
 * requires to equal the id token `sub`.
 *
 * The access token carries the already-resolved subject whenever `getSubject`
 * is configured — embedded at mint for a JWT, re-derived from the stored
 * `referenceId` for an opaque token — because the grant's reference is not
 * recoverable here. Pairwise without a hook is recomputed from the token's
 * client, which needs nothing but the client.
 */
async function resolvePresentationSub(
	opts: OAuthOptions<Scope[]>,
	jwt: Record<string, unknown>,
	user: User,
	client: SchemaClient<Scope[]> | null | undefined,
): Promise<string> {
	if (opts.getSubject) {
		const carried = jwt[resolvedSubjectClaim];
		if (typeof carried === "string") return carried;
		// No carrier means the token predates the hook, so it was issued under
		// the raw id. Re-running `getSubject` here without the grant's
		// `referenceId` would answer with a different identity.
		return client ? applyPairwiseSubject(user.id, client, opts) : user.id;
	}
	if (opts.pairwiseSecret && client) {
		return resolveSubjectIdentifier(user.id, client, opts);
	}
	return user.id;
}

/**
 * Handles the /oauth2/userinfo endpoint
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
		throw new APIError("UNAUTHORIZED", {
			error_description: "access token not found",
			error: "invalid_request",
		});
	}
	const { payload: jwt, requestedUserInfoClaims: requestedClaims } =
		await requireActiveAccessTokenWithClaims(
			ctx,
			opts,
			accessTokenAuthorization.token,
		);

	// The DPoP `htm`/`htu` check needs the real request method and URL. Without a
	// `ctx.request` (a programmatic `auth.api` call) the sender-constraint cannot
	// be verified, so fail closed for a DPoP-bound token rather than assume "GET".
	if (getDpopJktFromPayload(jwt) && !ctx.request) {
		throw new APIError("UNAUTHORIZED", {
			error_description:
				"DPoP-bound access token requires an HTTP request context",
			error: "invalid_token",
		});
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
		if (isDpopBindingError(error)) {
			throw new APIError("UNAUTHORIZED", {
				error_description: error.message,
				error: error.code,
			});
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

	// Present the resolved subject so it matches the id token / introspection;
	// the user lookup above already used the raw user.id.
	baseUserClaims.sub = await resolvePresentationSub(opts, jwt, user, client);

	// Claim contributors see the token without its carrier. It is an internal
	// transport, already consumed above, and a hook that forwarded token claims
	// wholesale would otherwise put it in the response body.
	const { [resolvedSubjectClaim]: _carriedSub, ...contributorJwt } = jwt;

	const extensionUserClaims = scopes?.length
		? await collectExtensionUserInfoClaims(opts, {
				ctx,
				opts,
				user,
				scopes,
				jwt: contributorJwt,
				client: client ?? undefined,
				requestedClaims,
			})
		: {};
	const additionalInfoUserClaims =
		opts.customUserInfoClaims && scopes?.length
			? await opts.customUserInfoClaims({
					user,
					scopes,
					jwt: contributorJwt,
					requestedClaims,
				})
			: {};
	const contributedClaims = {
		...pickClaims(extensionUserClaims, baseUserClaims),
		...pickClaims(additionalInfoUserClaims),
	};
	// Belt and braces: a contributor never receives the carrier, but it could
	// still return this key by name, and the response must not carry it.
	delete contributedClaims[resolvedSubjectClaim];

	// `sub` is pinned last so contributed claims can't override the resolved
	// subject and break cross-surface consistency.
	return {
		...baseUserClaims,
		...contributedClaims,
		sub: baseUserClaims.sub,
	};
}
