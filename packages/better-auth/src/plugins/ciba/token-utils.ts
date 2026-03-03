/**
 * Shared token generation for CIBA requests.
 * Used by both poll mode (token-handler) and push mode (push-delivery).
 *
 * ID token signing:
 * - When the OIDC/OAuth provider has `useJWTPlugin` enabled, signs with
 *   the JWT plugin's asymmetric keys (RS256/EdDSA). Preferred for production.
 * - Otherwise falls back to HS256 symmetric signing using the server secret.
 *   HS256 means clients cannot verify ID tokens independently; they must
 *   trust the authorization server. This matches the oidc-provider's own
 *   fallback behaviour.
 */

import type { GenericEndpointContext } from "@better-auth/core";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { SignJWT } from "jose";
import { generateRandomString } from "../../crypto";
import { getJwtToken } from "../jwt";
import type { OIDCOptions } from "../oidc-provider/types";
import type { CibaRequestData, CibaTokenResponse } from "./types";

const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = 3600;
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = 604800;

/**
 * Compute at_hash claim for ID token (per OIDC spec)
 */
async function computeAtHash(accessToken: string): Promise<string> {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(accessToken),
	);
	const halfHash = new Uint8Array(hash).slice(0, 16);
	return base64Url.encode(halfHash, { padding: false });
}

/**
 * Generate tokens for an approved CIBA request.
 * Shared between poll mode (token-handler) and push mode (push-delivery).
 */
export async function generateTokensForCibaRequest(
	ctx: GenericEndpointContext,
	cibaRequest: CibaRequestData,
): Promise<CibaTokenResponse> {
	const oidcPlugin =
		ctx.context.getPlugin("oidc-provider") ||
		ctx.context.getPlugin("oauth-provider");
	const oidcOpts = (oidcPlugin?.options || {}) as OIDCOptions;
	const accessTokenExpiresIn =
		oidcOpts.accessTokenExpiresIn ?? DEFAULT_ACCESS_TOKEN_EXPIRES_IN;
	const refreshTokenExpiresIn =
		oidcOpts.refreshTokenExpiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRES_IN;

	const user = await ctx.context.internalAdapter.findUserById(
		cibaRequest.userId,
	);
	if (!user) {
		throw new Error("User not found");
	}

	const accessToken = generateRandomString(32, "a-z", "A-Z", "0-9");
	const now = Date.now();
	const iat = Math.floor(now / 1000);
	const accessTokenExpiresAt = new Date(now + accessTokenExpiresIn * 1000);

	const requestedScopes = cibaRequest.scope.split(" ");
	const needsRefreshToken = requestedScopes.includes("offline_access");

	const refreshToken = generateRandomString(32, "a-z", "A-Z", "0-9");
	const refreshTokenExpiresAt = new Date(now + refreshTokenExpiresIn * 1000);

	await ctx.context.adapter.create({
		model: "oauthAccessToken",
		data: {
			accessToken,
			refreshToken,
			accessTokenExpiresAt,
			refreshTokenExpiresAt,
			clientId: cibaRequest.clientId,
			userId: user.id,
			scopes: requestedScopes.join(" "),
			createdAt: new Date(iat * 1000),
			updatedAt: new Date(iat * 1000),
		},
	});

	const profile = requestedScopes.includes("profile")
		? {
				given_name: user.name?.split(" ")[0],
				family_name: user.name?.split(" ")[1],
				name: user.name,
				picture: user.image,
				updated_at: Math.floor(new Date(user.updatedAt).getTime() / 1000),
			}
		: {};

	const email = requestedScopes.includes("email")
		? {
				email: user.email,
				email_verified: user.emailVerified,
			}
		: {};

	const atHash = await computeAtHash(accessToken);

	const idTokenPayload = {
		sub: user.id,
		aud: cibaRequest.clientId,
		iat,
		auth_req_id: cibaRequest.authReqId,
		at_hash: atHash,
		...profile,
		...email,
	};

	let idToken: string | undefined;

	if (requestedScopes.includes("openid")) {
		const useJwtPlugin = oidcOpts.useJWTPlugin;
		if (useJwtPlugin) {
			const jwtPlugin = ctx.context.getPlugin("jwt");
			if (jwtPlugin) {
				idToken = await getJwtToken(
					{
						...ctx,
						context: {
							...ctx.context,
							session: {
								session: {
									id: generateRandomString(32, "a-z", "A-Z"),
									createdAt: new Date(iat * 1000),
									updatedAt: new Date(iat * 1000),
									userId: user.id,
									expiresAt: accessTokenExpiresAt,
									token: accessToken,
									ipAddress: ctx.request?.headers.get("x-forwarded-for"),
								},
								user,
							},
						},
					},
					{
						...jwtPlugin.options,
						jwt: {
							...jwtPlugin.options?.jwt,
							getSubject: () => user.id,
							audience: cibaRequest.clientId,
							issuer:
								jwtPlugin.options?.jwt?.issuer ??
								(typeof ctx.context.options.baseURL === "string"
									? ctx.context.options.baseURL
									: undefined),
							expirationTime: iat + accessTokenExpiresIn,
							definePayload: () => idTokenPayload,
						},
					},
				);
			}
		}

		if (!idToken) {
			idToken = await new SignJWT(idTokenPayload)
				.setProtectedHeader({ alg: "HS256" })
				.setIssuedAt()
				.setExpirationTime(iat + accessTokenExpiresIn)
				.setIssuer(ctx.context.baseURL)
				.sign(new TextEncoder().encode(ctx.context.secret));
		}
	}

	return {
		access_token: accessToken,
		token_type: "Bearer",
		expires_in: accessTokenExpiresIn,
		refresh_token: needsRefreshToken ? refreshToken : undefined,
		scope: cibaRequest.scope,
		id_token: idToken,
	};
}
