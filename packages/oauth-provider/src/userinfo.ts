import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import { parseAccessTokenAuthorization } from "better-auth/oauth2";
import type { User } from "better-auth/types";
import {
	collectExtensionUserInfoClaims,
	hasUserInfoClaimExtension,
} from "./extensions";
import { verifyResourceRequest } from "./resource-request";
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
	const { authorization } = getUserInfoAccessToken(ctx);
	const { payload: jwt, requestedUserInfoClaims: requestedClaims } =
		await verifyResourceRequest(ctx, opts, {}, authorization ?? null);

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
