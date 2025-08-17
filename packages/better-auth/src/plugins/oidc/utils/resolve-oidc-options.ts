import type { OIDCOptions } from "../types";

import { APIError } from "../../../api";
import { generateRandomString } from "../../../crypto";

export type ResolvedOIDCOptions = Required<OIDCOptions>;

export const resolveOIDCOptions = (
	options: OIDCOptions,
): ResolvedOIDCOptions => {
	return {
		metadata: options.metadata ?? {},

		codeExpiresIn: options.codeExpiresIn ?? 600,
		accessTokenExpiresIn: options.accessTokenExpiresIn ?? 3600,
		refreshTokenExpiresIn: options.refreshTokenExpiresIn ?? 604800,

		allowDynamicClientRegistration:
			options.allowDynamicClientRegistration ?? false,

		scopes: options.scopes?.length
			? [
					...new Set([
						"openid",
						"profile",
						"email",
						"offline_access",
						...options.scopes,
					]),
				]
			: ["openid", "profile", "email", "offline_access"],
		defaultScope: options.defaultScope ?? "openid",

		loginPage: options.loginPage,
		consentPage: options.consentPage ?? "",
		requirePKCE: options.requirePKCE ?? true,
		useJWTPlugin: options.useJWTPlugin ?? false,
		trustedClients: options.trustedClients ?? [],
		storeClientSecret: options.storeClientSecret ?? "plain",
		allowPlainCodeChallengeMethod:
			options.allowPlainCodeChallengeMethod ?? true,

		getConsentHTML:
			options.getConsentHTML ??
			(() => {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "No consent page provided",
				});
			}),
		generateClientId:
			options.generateClientId ??
			(() => generateRandomString(32, "a-z", "A-Z")),
		generateClientSecret:
			options.generateClientSecret ??
			(() => generateRandomString(32, "a-z", "A-Z")),
		getAdditionalUserInfoClaim:
			options.getAdditionalUserInfoClaim ?? (() => ({})),
	};
};
