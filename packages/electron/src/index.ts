import type { BetterAuthPlugin } from "@better-auth/core";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import type { User } from "better-auth/db";
import { parseUserOutput } from "better-auth/db";
import * as z from "zod";

export interface ElectronOptions {
	/**
	 * The duration (in seconds) for which the authorization code remains valid.
	 *
	 * @default 600 (10 minutes)
	 */
	codeExpiresIn?: number | undefined;
	/**
	 * The name of the cookie used for redirecting after authentication.
	 *
	 * @default "redirect_client"
	 */
	redirectCookieName?: string | undefined;
	/**
	 * The prefix to use for cookies set by the plugin.
	 *
	 * @default "better-auth"
	 */
	cookiePrefix?: string | undefined;
	disableOriginOverride?: boolean | undefined;
}

export const electron = (options?: ElectronOptions | undefined) => {
	const opts = {
		codeExpiresIn: 600,
		redirectCookieName: "redirect_client",
		cookiePrefix: "better-auth",
		...(options || {}),
	};

	return {
		id: "electron",
		async onRequest(request, _ctx) {
			if (opts.disableOriginOverride || request.headers.get("origin")) {
				return;
			}

			/**
			 * To bypass origin check from electron, we need to set the origin
			 * header to the electron-origin header
			 */
			const electronOrigin = request.headers.get("electron-origin");
			if (!electronOrigin) {
				return;
			}

			const req = request.clone();
			req.headers.set("origin", electronOrigin);
			return {
				request: req,
			};
		},
		hooks: {
			after: [
				{
					matcher: (ctx) => {
						return (
							(ctx.path.startsWith("/sign-in") &&
								!ctx.path.startsWith("/sign-in/social")) ||
							ctx.path.startsWith("/sign-up") ||
							ctx.path.startsWith("/callback") ||
							ctx.path.startsWith("/oauth2/callback") ||
							ctx.path.startsWith("/magic-link/verify") ||
							ctx.path.startsWith("/email-otp/verify-email") ||
							ctx.path.startsWith("/one-tap/callback") ||
							ctx.path.startsWith("/passkey/verify-authentication") ||
							ctx.path.startsWith("/phone-number/verify")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!ctx.context.newSession?.session) {
							return;
						}

						const redirectCookieName = `${opts.cookiePrefix}.${opts.redirectCookieName}`;

						const identifier = `electron:${generateRandomString(32, "a-z", "A-Z", "0-9")}`;
						const codeExpiresInMs = opts.codeExpiresIn * 1000;
						const expiresAt = new Date(Date.now() * codeExpiresInMs);
						const code =
							await ctx.context.internalAdapter.createVerificationValue({
								identifier,
								value: JSON.stringify({
									userId: ctx.context.newSession.user.id,
								}),
								expiresAt,
							});

						ctx.setCookie(redirectCookieName, code.identifier, {
							...ctx.context.authCookies.sessionToken.options,
							maxAge: opts.codeExpiresIn,
							httpOnly: false,
						});

						return {
							context: ctx,
						};
					}),
				},
			],
		},
		endpoints: {
			electronToken: createAuthEndpoint(
				"/electron/token",
				{
					method: "POST",
					body: z.object({
						code: z.string().nonempty(),
					}),
					metadata: {
						isAction: false,
						scope: "http",
					},
				},
				async (ctx) => {
					const { code } = ctx.body;

					const token =
						await ctx.context.internalAdapter.findVerificationValue(code);
					if (!token || token.expiresAt < new Date()) {
						throw new APIError("NOT_FOUND", {
							message: "Invalid or expired token.",
						});
					}

					const tokenRecord = JSON.parse(token.value);

					await ctx.context.internalAdapter.deleteVerificationValue(token.id);

					const user = await ctx.context.internalAdapter.findUserById(
						tokenRecord.userId,
					);
					if (!user) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "User not found",
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
					);
					if (!session) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to create session",
						});
					}

					await setSessionCookie(ctx, {
						session,
						user,
					});

					return ctx.json({
						token: session.token,
						user: parseUserOutput(ctx.context.options, user) as User &
							Record<string, any>,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
