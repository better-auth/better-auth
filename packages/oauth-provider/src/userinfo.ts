import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import type { User } from "better-auth/types";
import {
	collectExtensionUserInfoClaims,
	hasUserInfoClaimExtension,
} from "./extensions";
import { validateAccessToken } from "./introspect";
import type { OAuthOptions, Scope } from "./types";
import { getClient, resolveSubjectIdentifier } from "./utils";

/**
 * Provides shared /userinfo and id_token claims functionality
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#NormalClaims
 */
export function userNormalClaims(user: User, scopes: string[]) {
	const name = user.name.split(" ").filter((v) => v !== "");
	const profile = {
		name: user.name ?? undefined,
		picture: user.image ?? undefined,
		given_name: name.length > 1 ? name.slice(0, -1).join(" ") : undefined,
		family_name: name.length > 1 ? name.at(-1) : undefined,
	};
	const email = {
		email: user.email ?? undefined,
		email_verified: user.emailVerified ?? false,
	};

	return {
		sub: user.id ?? undefined,
		...(scopes.includes("profile") ? profile : {}),
		...(scopes.includes("email") ? email : {}),
	};
}

/**
 * Returns the defined-valued entries of `claims`, dropping any key already
 * present in `base` when given. This is the additive-claim rule shared by the
 * /userinfo response and the ID token: a contributor may add new claims but
 * never replace one the provider already owns.
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

/**
 * Handles the /oauth2/userinfo endpoint
 */
export async function userInfoEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const authorization = ctx.headers?.get("authorization");
	const token =
		typeof authorization === "string" && authorization?.startsWith("Bearer ")
			? authorization?.replace("Bearer ", "")
			: authorization;
	if (!token?.length) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "authorization header not found",
			error: "invalid_request",
		});
	}
	const jwt = await validateAccessToken(ctx, opts, token);

	// A token that is expired, revoked, or bound to an ended session resolves to
	// `{ active: false }`. RFC 6750 §3.1 wants `invalid_token` (401) for that,
	// not the `invalid_scope` (400) the scope check below would otherwise raise.
	if (!jwt.active) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "the access token is invalid or has been revoked",
			error: "invalid_token",
		});
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

	const baseUserClaims = userNormalClaims(user, scopes ?? []);
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
			})
		: {};
	const additionalInfoUserClaims =
		opts.customUserInfoClaims && scopes?.length
			? await opts.customUserInfoClaims({ user, scopes, jwt })
			: {};
	return {
		...baseUserClaims,
		...pickClaims(extensionUserClaims, baseUserClaims),
		...pickClaims(additionalInfoUserClaims),
		sub: baseUserClaims.sub,
	};
}
