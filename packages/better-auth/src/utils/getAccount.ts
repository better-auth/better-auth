import type { OAuth2Tokens } from "arctic";

export function getAccountTokens(tokens: OAuth2Tokens) {
	const accessToken = tokens.accessToken();
	let refreshToken = tokens.hasRefreshToken()
		? tokens.refreshToken()
		: undefined;
	let accessTokenExpiresAt = undefined;
	try {
		accessTokenExpiresAt = tokens.accessTokenExpiresAt();
	} catch {}
	return {
		accessToken,
		refreshToken,
		expiresAt: accessTokenExpiresAt,
	};
}
