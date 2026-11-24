import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import * as z from "zod";
import { APIError, sessionMiddleware } from "../../api";
import {
	deleteSessionCookie,
	expireCookie,
	parseCookies,
	parseSetCookieHeader,
	SECURE_COOKIE_PREFIX,
	setSessionCookie,
} from "../../cookies";
import { parseSessionOutput, parseUserOutput } from "../../db/schema";
import { PACKAGE_VERSION } from "../../version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"multi-session": {
			creator: typeof multiSession;
		};
	}
}

export interface MultiSessionConfig {
	/**
	 * The maximum number of sessions a user can have
	 * at a time
	 * @default 5
	 */
	maximumSessions?: number | undefined;
}

import { MULTI_SESSION_ERROR_CODES as ERROR_CODES } from "./error-codes";

export { MULTI_SESSION_ERROR_CODES as ERROR_CODES } from "./error-codes";

const setActiveSessionBodySchema = z.object({
	sessionToken: z.string().meta({
		description: "The session token to set as active",
	}),
});

const revokeDeviceSessionBodySchema = z.object({
	sessionToken: z.string().meta({
		description: "The session token to revoke",
	}),
});

export const multiSession = (options?: MultiSessionConfig | undefined) => {
	const opts = {
		maximumSessions: 5,
		...options,
	};

	const isMultiSessionCookie = (key: string) => key.includes("_multi-");

	return {
		id: "multi-session",
		version: PACKAGE_VERSION,
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * GET `/multi-session/list-device-sessions`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.listDeviceSessions`
			 *
			 * **client:**
			 * `authClient.multiSession.listDeviceSessions`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-list-device-sessions)
			 */
			listDeviceSessions: createAuthEndpoint(
				"/multi-session/list-device-sessions",
				{
					method: "GET",
					requireHeaders: true,
				},
				async (ctx) => {
					const cookieHeader = ctx.headers?.get("cookie");
					if (!cookieHeader) return ctx.json([]);

					const cookies = Object.fromEntries(parseCookies(cookieHeader));
					const sessionTokens = (
						await Promise.all(
							Object.entries(cookies)
								.filter(([key]) => isMultiSessionCookie(key))
								.map(
									async ([key]) =>
										await ctx.getSignedCookie(key, ctx.context.secret),
								),
						)
					).filter((v) => typeof v === "string");

					if (!sessionTokens.length) return ctx.json([]);
					const sessions = await ctx.context.internalAdapter.findSessions(
						sessionTokens,
						{ onlyActiveSessions: true },
					);
					const validSessions = sessions.filter(
						(session) =>
							session &&
							!(session.session as { impersonatedBy?: string })
								.impersonatedBy &&
							session.session.expiresAt > new Date(),
					);
					const uniqueUserSessions = validSessions.reduce(
						(acc, session) => {
							if (!acc.find((s) => s.user.id === session.user.id)) {
								acc.push(session);
							}
							return acc;
						},
						[] as typeof validSessions,
					);
					return ctx.json(
						uniqueUserSessions.map((item) => ({
							session: parseSessionOutput(ctx.context.options, item.session),
							user: parseUserOutput(ctx.context.options, item.user),
						})),
					);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/multi-session/set-active`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.setActiveSession`
			 *
			 * **client:**
			 * `authClient.multiSession.setActive`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-set-active)
			 */
			setActiveSession: createAuthEndpoint(
				"/multi-session/set-active",
				{
					method: "POST",
					body: setActiveSessionBodySchema,
					requireHeaders: true,
					metadata: {
						openapi: {
							description: "Set the active session",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													session: {
														$ref: "#/components/schemas/Session",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const sessionToken = ctx.body.sessionToken;
					const multiSessionCookieName = `${
						ctx.context.authCookies.sessionToken.name
					}_multi-${sessionToken.toLowerCase()}`;
					const sessionCookie = await ctx.getSignedCookie(
						multiSessionCookieName,
						ctx.context.secret,
					);
					if (!sessionCookie) {
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.INVALID_SESSION_TOKEN,
						);
					}
					// The signed cookie value is the authoritative token; act on it, not
					// on the request body. The signature covers the cookie value, not its
					// name, so a request must not be able to pair a validly-signed cookie
					// with a different token to activate a session it does not hold a
					// cookie for.
					const session =
						await ctx.context.internalAdapter.findSession(sessionCookie);
					if (!session || session.session.expiresAt < new Date()) {
						expireCookie(ctx, {
							name: multiSessionCookieName,
							attributes: ctx.context.authCookies.sessionToken.attributes,
						});
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.INVALID_SESSION_TOKEN,
						);
					}
					await setSessionCookie(ctx, session);
					return ctx.json({
						session: parseSessionOutput(ctx.context.options, session.session),
						user: parseUserOutput(ctx.context.options, session.user),
					});
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/multi-session/revoke`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.revokeDeviceSession`
			 *
			 * **client:**
			 * `authClient.multiSession.revoke`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-revoke)
			 */
			revokeDeviceSession: createAuthEndpoint(
				"/multi-session/revoke",
				{
					method: "POST",
					body: revokeDeviceSessionBodySchema,
					requireHeaders: true,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Revoke a device session",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													status: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const sessionToken = ctx.body.sessionToken;
					const multiSessionCookieName = `${
						ctx.context.authCookies.sessionToken.name
					}_multi-${sessionToken.toLowerCase()}`;
					const sessionCookie = await ctx.getSignedCookie(
						multiSessionCookieName,
						ctx.context.secret,
					);
					if (!sessionCookie) {
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.INVALID_SESSION_TOKEN,
						);
					}

					// Revoke the session proven by the signed cookie value, not the
					// request-named token, so possession of one valid multi-session
					// cookie cannot revoke a different session.
					await ctx.context.internalAdapter.deleteSession(sessionCookie);
					expireCookie(ctx, {
						name: multiSessionCookieName,
						attributes: ctx.context.authCookies.sessionToken.attributes,
					});
					const isActive = ctx.context.session?.session.token === sessionCookie;
					if (!isActive) return ctx.json({ status: true });

					const cookieHeader = ctx.headers?.get("cookie");
					if (cookieHeader) {
						const cookies = Object.fromEntries(parseCookies(cookieHeader));

						const sessionTokens = (
							await Promise.all(
								Object.entries(cookies)
									.filter(([key]) => isMultiSessionCookie(key))
									.map(
										async ([key]) =>
											await ctx.getSignedCookie(key, ctx.context.secret),
									),
							)
						).filter((v) => typeof v === "string");
						const internalAdapter = ctx.context.internalAdapter;

						if (sessionTokens.length > 0) {
							const sessions =
								await internalAdapter.findSessions(sessionTokens);
							const validSessions = sessions.filter(
								(session) => session && session.session.expiresAt > new Date(),
							);

							if (validSessions.length > 0) {
								const nextSession = validSessions[0]!;
								await setSessionCookie(ctx, nextSession);
							} else {
								deleteSessionCookie(ctx);
							}
						} else {
							deleteSessionCookie(ctx);
						}
					} else {
						deleteSessionCookie(ctx);
					}
					return ctx.json({
						status: true,
					});
				},
			),
		},
		hooks: {
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						const cookieString = ctx.context.responseHeaders?.get("set-cookie");
						if (!cookieString) return;
						const newSession = ctx.context.newSession;
						if (!newSession) return;
						// An impersonation session is temporary: the admin plugin deletes it
						// when impersonation stops. Treating it as a new device session would
						// replace the target user's real session and leave a cookie pointing
						// at a session that no longer exists.
						if (newSession.session.impersonatedBy) return;

						const sessionCookieConfig = ctx.context.authCookies.sessionToken;
						const sessionToken = newSession.session.token;
						const cookieName = `${sessionCookieConfig.name}_multi-${sessionToken.toLowerCase()}`;

						const setCookies = parseSetCookieHeader(cookieString);
						const cookies = parseCookies(ctx.headers?.get("cookie") || "");
						if (setCookies.get(cookieName) || cookies.get(cookieName)) return;

						const multiSessionKeys = Object.keys(
							Object.fromEntries(cookies),
						).filter(isMultiSessionCookie);

						// The same deployment can be served over HTTP and HTTPS, so a
						// browser may hold either variant of this instance's cookie name.
						// Ownership is still verified below by the signature and by
						// matching the full name against the signed token, so another
						// app's cookies are never counted or cleared.
						const ownedNames = [
							sessionCookieConfig.name,
							sessionCookieConfig.name.startsWith(SECURE_COOKIE_PREFIX)
								? sessionCookieConfig.name.slice(SECURE_COOKIE_PREFIX.length)
								: `${SECURE_COOKIE_PREFIX}${sessionCookieConfig.name}`,
						];
						const expireDeviceCookie = (name: string) =>
							ctx.setCookie(name, "", {
								...sessionCookieConfig.attributes,
								// Browsers ignore the deletion of a `__Secure-` cookie unless
								// the Secure attribute is set on the expiring entry too.
								secure: name.startsWith(SECURE_COOKIE_PREFIX),
								maxAge: 0,
							});

						const tokensToDelete: string[] = [];
						const staleCookieKeys: string[] = [];
						const seenTokens = new Set<string>();
						let ownedCount = 0;
						for (const key of multiSessionKeys) {
							const name = ownedNames.find((ownedName) =>
								key.startsWith(`${ownedName}_multi-`),
							);
							if (!name) continue;
							const token = await ctx.getSignedCookie(key, ctx.context.secret);
							// The signed token must be exactly the one in the cookie name.
							// This works for custom token formats and ignores cookies
							// another app signed or named differently.
							if (!token || key !== `${name}_multi-${token.toLowerCase()}`) {
								continue;
							}
							const dedupeKey = token.toLowerCase();
							if (seenTokens.has(dedupeKey)) {
								// Both cookie variants can hold the same session: count it
								// once and clear the duplicate.
								staleCookieKeys.push(key);
								expireDeviceCookie(key);
								continue;
							}
							seenTokens.add(dedupeKey);
							ownedCount++;
							const session =
								await ctx.context.internalAdapter.findSession(token);
							if (
								!session ||
								(session.session as { impersonatedBy?: string })
									.impersonatedBy ||
								session.session.expiresAt < new Date()
							) {
								// A device cookie whose session was deleted, expired, or was
								// left behind by impersonation before this fix must not keep a
								// slot reserved and block the next sign-in. The session itself
								// is left alone; only the cookie is cleared.
								staleCookieKeys.push(key);
								expireDeviceCookie(key);
								continue;
							}
							if (session.user.id === newSession.user.id) {
								tokensToDelete.push(token);
								expireDeviceCookie(key);
							}
						}
						if (tokensToDelete.length > 0) {
							await ctx.context.internalAdapter.deleteSessions(tokensToDelete);
						}

						const currentCount =
							ownedCount -
							tokensToDelete.length -
							staleCookieKeys.length +
							(cookieString.includes(sessionCookieConfig.name) ? 1 : 0);

						if (currentCount > opts.maximumSessions) return;

						await ctx.setSignedCookie(
							cookieName,
							sessionToken,
							ctx.context.secret,
							sessionCookieConfig.attributes,
						);
					}),
				},
				{
					matcher: (context) => context.path === "/sign-out",
					handler: createAuthMiddleware(async (ctx) => {
						const cookieHeader = ctx.headers?.get("cookie");
						if (!cookieHeader) return;
						const cookies = Object.fromEntries(parseCookies(cookieHeader));
						const multiSessionKeys = Object.keys(cookies).filter((key) =>
							isMultiSessionCookie(key),
						);
						const verifiedTokens = (
							await Promise.all(
								multiSessionKeys.map(async (key) => {
									const verifiedToken = await ctx.getSignedCookie(
										key,
										ctx.context.secret,
									);
									if (verifiedToken) {
										expireCookie(ctx, {
											name: key
												.toLowerCase()
												.replace(
													SECURE_COOKIE_PREFIX.toLowerCase(),
													SECURE_COOKIE_PREFIX,
												),
											attributes:
												ctx.context.authCookies.sessionToken.attributes,
										});
										return verifiedToken;
									}
									return null;
								}),
							)
						).filter((v) => typeof v === "string");
						if (verifiedTokens.length > 0) {
							await ctx.context.internalAdapter.deleteSessions(verifiedTokens);
						}
					}),
				},
			],
		},
		options,
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
