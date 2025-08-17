import type { OIDCOptions } from "../types";

export const makeOpts = (options: OIDCOptions) => {
	return {
		codeExpiresIn: 600,
		defaultScope: "openid",
		accessTokenExpiresIn: 3600,
		refreshTokenExpiresIn: 604800,
		allowPlainCodeChallengeMethod: true,
		storeClientSecret: "plain" as const,
		...options,
		scopes: [
			"openid",
			"profile",
			"email",
			"offline_access",
			...(options?.scopes || []),
		],
	} satisfies OIDCOptions;
};
