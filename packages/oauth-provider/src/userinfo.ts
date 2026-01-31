import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import type { User } from "better-auth/types";
import { validateAccessToken } from "./introspect";
import type { OAuthOptions, Scope } from "./types";

/**
 * Provides shared /userinfo and id_token claims functionality
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#NormalClaims
 */
export function userNormalClaims(user: User, scopes: string[]) {
	let givenName: string | undefined;
	let familyName: string | undefined;
	if (user.name) {
		const nameParts = user.name.split(" ").filter(Boolean);
		if (nameParts.length > 1) {
			familyName = nameParts.pop();
			givenName = nameParts.join(" ");
		} else {
			givenName = nameParts[0];
		}
	}

	const profile = {
		name: user.name ?? undefined,
		picture: user.image ?? undefined,
		given_name: givenName,
		family_name: familyName,
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

	const baseUserClaims = userNormalClaims(user, scopes ?? []);
	const additionalInfoUserClaims =
		opts.customUserInfoClaims && scopes?.length
			? await opts.customUserInfoClaims({ user, scopes, jwt })
			: {};
	return {
		...baseUserClaims,
		...additionalInfoUserClaims,
	};
}
