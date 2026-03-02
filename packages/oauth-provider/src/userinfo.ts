import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import type { User } from "better-auth/types";
import { validateAccessToken } from "./introspect";
import type { OAuthOptions, Scope } from "./types";
import { getClient, resolveSubjectIdentifier } from "./utils";

/**
 * Provides shared /userinfo and id_token claims functionality
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#NormalClaims
 */
export function userNormalClaims(
	user: User,
	scopes: string[],
	resolvedSub?: string,
) {
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
		sub: resolvedSub ?? user.id ?? undefined,
		...(scopes.includes("profile") ? profile : {}),
		...(scopes.includes("email") ? email : {}),
	};
}

/**
 * Handles the /oauth2/userinfo endpoint
 */
export async function userInfoEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	if (!ctx.request) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "request not found",
			error: "invalid_request",
		});
	}

	const authorization = ctx.request.headers.get("authorization");
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

	// Resolve pairwise sub if client is configured for it
	let resolvedSub: string | undefined;
	const clientId = (jwt.client_id ?? jwt.azp) as string | undefined;
	if (clientId) {
		const client = await getClient(ctx, opts, clientId);
		if (client) {
			resolvedSub = await resolveSubjectIdentifier(user.id, client, opts);
		}
	}

	const baseUserClaims = userNormalClaims(user, scopes ?? [], resolvedSub);
	const additionalInfoUserClaims =
		opts.customUserInfoClaims && scopes?.length
			? await opts.customUserInfoClaims({ user, scopes, jwt })
			: {};
	return {
		...baseUserClaims,
		...additionalInfoUserClaims,
	};
}
