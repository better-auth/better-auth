import type { OAuth2Tokens } from "../social-providers";

export function getAccountTokens(tokens: OAuth2Tokens) {
	const accessToken = tokens.accessToken;
	let refreshToken = tokens.refreshToken;
	let accessTokenExpiresAt = undefined;
	try {
		accessTokenExpiresAt = tokens.accessTokenExpiresAt;
	} catch {}
	return {
		accessToken,
		refreshToken,
		expiresAt: accessTokenExpiresAt,
	};
}
