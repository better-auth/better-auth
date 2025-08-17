import type { OIDCOptions } from "./types";
import type { BetterAuthPlugin } from "../../types";

import { schema } from "./schema";
import { makeAuthorize } from "./make-authorize";
import { createAuthMiddleware } from "../../api";
import { parseSetCookieHeader } from "../../cookies";

export type MakeOidcPlugin = {
	id: string;
	alwaysSkipConsent: boolean;
	disableCorsInAuthorize: boolean;
};

const consentHook = (opts: OIDCOptions, makePluginOpts: MakeOidcPlugin) => [
	{
		matcher() {
			return true;
		},
		handler: createAuthMiddleware(async (ctx) => {
			const cookie = await ctx.getSignedCookie(
				"oidc_login_prompt",
				ctx.context.secret,
			);
			const cookieName = ctx.context.authCookies.sessionToken.name;
			const parsedSetCookieHeader = parseSetCookieHeader(
				ctx.context.responseHeaders?.get("set-cookie") || "",
			);
			const hasSessionToken = parsedSetCookieHeader.has(cookieName);
			if (!cookie || !hasSessionToken) {
				return;
			}
			ctx.setCookie("oidc_login_prompt", "", {
				maxAge: 0,
			});
			const sessionCookie = parsedSetCookieHeader.get(cookieName)?.value;
			const sessionToken = sessionCookie?.split(".")[0];
			if (!sessionToken) {
				return;
			}
			const session =
				await ctx.context.internalAdapter.findSession(sessionToken);
			if (!session) {
				return;
			}
			ctx.query = JSON.parse(cookie);
			ctx.query!.prompt = "consent";
			ctx.context.session = session;
			const response = await makeAuthorize(makePluginOpts)(ctx, opts);
			return response;
		}),
	},
];

const makeOpts = (options: OIDCOptions) => {
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

export const makeOidcPlugin =
	(makePluginOpts: MakeOidcPlugin) => (options: OIDCOptions) => {
		const opts = makeOpts(options);

		return {
			id: makePluginOpts.id,
			schema,
			hooks: {
				after: consentHook(opts, makePluginOpts),
			},
		} satisfies BetterAuthPlugin;
	};
