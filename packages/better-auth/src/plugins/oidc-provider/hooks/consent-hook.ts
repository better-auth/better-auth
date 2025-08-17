import type { MakeOidcPlugin } from "../make-oidc-plugin";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { makeAuthorize } from "../make-authorize";
import { createAuthMiddleware } from "../../../api";
import { parseSetCookieHeader } from "../../../cookies";

export const consentHook = (
	opts: ResolvedOIDCOptions,
	makePluginOpts: MakeOidcPlugin,
) => [
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

			const authorize = makeAuthorize(makePluginOpts);
			const response = await authorize(ctx, opts);

			return response;
		}),
	},
];
