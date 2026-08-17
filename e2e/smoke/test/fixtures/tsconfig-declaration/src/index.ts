import { electron } from "@better-auth/electron";
import { expo } from "@better-auth/expo";
import { i18n } from "@better-auth/i18n";
import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { scim } from "@better-auth/scim";
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { organization } from "better-auth/plugins";
import type { GoogleProfile, JoinConfig, JoinOption } from "better-auth/types";

/**
 * @see https://github.com/better-auth/better-auth/issues/9378
 * @see https://github.com/better-auth/better-auth/issues/10789
 */
export const auth = betterAuth({
	plugins: [
		electron(),
		expo(),
		i18n({ translations: { en: {} } }),
		organization({}),
		oauthProvider({
			loginPage: "/auth/sign-in",
			consentPage: "/auth/oauth/consent",
			scopes: ["openid", "email"],
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
		}),
		scim(),
	],
});

export const resourceClient = createAuthClient({
	plugins: [oauthProviderResourceClient()],
});

auth.api
	.getSession({
		headers: new Headers(),
	})
	.catch();

auth.api
	.getSession({
		headers: [] as [string, string][],
	})
	.catch();

auth.api
	.getSession({
		headers: {} as Record<string, string>,
	})
	.catch();

auth.api
	.getSession({
		headers: new Headers(),
		asResponse: true,
	})
	.then((r: Response) => {
		console.log(r);
	});

auth.api
	.getSession({
		headers: new Headers(),
		returnHeaders: true,
	})
	.then(({ headers }: { headers: Headers }) => {
		console.log(headers);
	});

/**
 * @see https://github.com/better-auth/better-auth/issues/6876
 */
export type TypeExportRegression = {
	profile: GoogleProfile;
	joinOption: JoinOption;
	joinConfig: JoinConfig;
};
