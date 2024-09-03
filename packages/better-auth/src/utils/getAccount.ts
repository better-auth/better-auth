import type { OAuth2Tokens } from "arctic";

export function getAccountTokens(tokens: OAuth2Tokens) {
	const accessToken = tokens.accessToken();
	let refreshToken = undefined;

	try {
		refreshToken = tokens.refreshToken();
	} catch {}
	let accessTokenExpiresAt = undefined;
	let refreshTokenExpiresAt = undefined;
	try {
		accessTokenExpiresAt = tokens.accessTokenExpiresAt();
	} catch {}
	try {
		refreshTokenExpiresAt = tokens.refreshTokenExpiresAt();
	} catch {}
	return {
		accessToken,
		refreshToken,
		accessTokenExpiresAt,
		refreshTokenExpiresAt,
	};
}
