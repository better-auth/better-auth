import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import type { OAuth2Tokens } from "../../oauth2";

/**
 *
 * @param tokens
 * @param finalUserInfoUrl
 * @returns
 */
export async function getUserInfo(
	tokens: OAuth2Tokens,
	finalUserInfoUrl: string | undefined,
) {
	if (tokens.idToken) {
		const decoded = decodeJwt(tokens.idToken) as {
			sub: string;
			email_verified: boolean;
			email: string;
			name: string;
			picture: string;
		};
		if (decoded) {
			if (decoded.sub && decoded.email) {
				return {
					id: decoded.sub,
					emailVerified: decoded.email_verified,
					image: decoded.picture,
					...decoded,
				};
			}
		}
	}

	if (!finalUserInfoUrl) {
		return null;
	}

	const userInfo = await betterFetch<{
		email: string;
		sub?: string;
		name: string;
		email_verified: boolean;
		picture: string;
	}>(finalUserInfoUrl, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${tokens.accessToken}`,
		},
	});
	return {
		id: userInfo.data?.sub,
		emailVerified: userInfo.data?.email_verified,
		email: userInfo.data?.email,
		image: userInfo.data?.picture,
		name: userInfo.data?.name,
		...userInfo.data,
	};
}
