import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, isAPIError } from "better-auth/api";
import type { User } from "better-auth/types";
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
	let jwt: Awaited<ReturnType<typeof validateAccessToken>>;
	try {
		jwt = await validateAccessToken(ctx, opts, token);
	} catch (error) {
		// RFC 6750 §3.1: an invalid or expired bearer token is `invalid_token` and
		// must be answered with 401 (+ a WWW-Authenticate challenge), not the generic
		// 400 `invalid_request` that `validateAccessToken` throws when both JWT and
		// opaque validation fail. Resource clients (e.g. OAuth integrations that rely
		// on auto-refresh) only renew their token on a 401, so a 400 strands otherwise
		// valid sessions. The legacy oidc-provider plugin also returned 401 here.
		if (
			isAPIError(error) &&
			(error.body as { error_description?: string } | undefined)
				?.error_description === "Invalid access token"
		) {
			throw new APIError(
				"UNAUTHORIZED",
				{ error: "invalid_token", error_description: "Invalid access token" },
				{
					"WWW-Authenticate":
						'Bearer error="invalid_token", error_description="Invalid access token"',
				},
			);
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

	const baseUserClaims = userNormalClaims(user, scopes ?? []);

	// Resolve pairwise sub if server has pairwise enabled and client is configured for it
	if (opts.pairwiseSecret) {
		const clientId = (jwt.client_id ?? jwt.azp) as string | undefined;
		if (clientId) {
			const client = await getClient(ctx, opts, clientId);
			if (client) {
				baseUserClaims.sub = await resolveSubjectIdentifier(
					user.id,
					client,
					opts,
				);
			}
		}
	}
	const additionalInfoUserClaims =
		opts.customUserInfoClaims && scopes?.length
			? await opts.customUserInfoClaims({ user, scopes, jwt })
			: {};
	return {
		...baseUserClaims,
		...additionalInfoUserClaims,
	};
}
