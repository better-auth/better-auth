import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import type { User } from "better-auth/types";
import { validateAccessToken } from "./introspect";
import type { OAuthOptions, Scope } from "./types";
import {
	getClient,
	resolvedSubjectClaim,
	resolveSubjectIdentifier,
} from "./utils";

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
 * Resolves the presentation subject for /userinfo so it matches the id token
 * and introspection. A JWT access token embeds the already-resolved subject
 * (only when a getSubject hook — its sole producer — is configured); otherwise
 * it is recomputed, which is the pairwise case. Falls back to the raw user.id.
 */
async function resolvePresentationSub(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	jwt: Awaited<ReturnType<typeof validateAccessToken>>,
	user: User,
): Promise<string> {
	if (opts.getSubject) {
		const embeddedSub = jwt[resolvedSubjectClaim];
		if (typeof embeddedSub === "string") {
			return embeddedSub;
		}
	}

	// No embedded subject: recompute it only when the issuer rewrites subjects.
	if (opts.pairwiseSecret || opts.getSubject) {
		const clientId = jwt.client_id ?? jwt.azp;
		if (typeof clientId === "string") {
			const client = await getClient(ctx, opts, clientId);
			if (client) {
				return resolveSubjectIdentifier(user.id, client, opts);
			}
		}
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

	// Present the resolved subject so it matches the id token / introspection;
	// the user lookup above already used the raw user.id.
	baseUserClaims.sub = await resolvePresentationSub(ctx, opts, jwt, user);

	const additionalInfoUserClaims =
		opts.customUserInfoClaims && scopes?.length
			? await opts.customUserInfoClaims({ user, scopes, jwt })
			: {};
	// `sub` is pinned last so custom claims can't override the resolved subject
	// and break cross-surface consistency.
	return {
		...baseUserClaims,
		...additionalInfoUserClaims,
		sub: baseUserClaims.sub,
	};
}
