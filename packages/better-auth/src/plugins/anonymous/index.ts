import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { generateId } from "@better-auth/core/utils/id";
import * as z from "zod";
import {
	APIError,
	addOAuthServerContext,
	getOAuthState,
	getSessionFromCtx,
	sensitiveSessionMiddleware,
} from "../../api";
import {
	deleteSessionCookie,
	parseSetCookieHeader,
	setSessionCookie,
} from "../../cookies";
import { mergeSchema, parseUserOutput } from "../../db/schema";
import type { Session, User } from "../../types";
import { PACKAGE_VERSION } from "../../version";
import { anonymousSettingsCards } from "./anonymous-ui";
import { ANONYMOUS_ERROR_CODES } from "./error-codes";
import { schema } from "./schema";
import type {
	AnonymousOptions,
	AnonymousSession,
	UserWithAnonymous,
} from "./types";

/**
 * Resolves the anonymous session being upgraded during an account-link callback.
 *
 * The anonymous session is normally read from the request cookie. When the
 * OAuth callback arrives without that cookie (for example Expo's in-app browser,
 * which only carries the OAuth state, not the session cookie), the anonymous
 * user id captured at sign-in is recovered from the server-only OAuth state
 * instead. Returns `null` when there is no anonymous session to link.
 */
async function resolveAnonymousSession(ctx: GenericEndpointContext): Promise<{
	session: Session & Record<string, any>;
	user: UserWithAnonymous & Record<string, any>;
} | null> {
	const cookieSession = await getSessionFromCtx<{
		isAnonymous: boolean | null;
	}>(ctx, { disableRefresh: true });
	if (cookieSession?.user.isAnonymous) {
		return {
			session: cookieSession.session,
			user: { ...cookieSession.user, isAnonymous: true },
		};
	}

	const anonymousUserId = (await getOAuthState())?.serverContext
		?.anonymousUserId;
	if (typeof anonymousUserId !== "string") {
		return null;
	}
	const user = (await ctx.context.internalAdapter.findUserById(
		anonymousUserId,
	)) as (User & { isAnonymous?: boolean | null }) | null;
	if (!user?.isAnonymous) {
		return null;
	}
	const [anonymousSession] = await ctx.context.internalAdapter.listSessions(
		user.id,
		{ onlyActiveSessions: true },
	);
	if (!anonymousSession) {
		return null;
	}
	return {
		session: anonymousSession,
		user: { ...user, isAnonymous: true },
	};
}

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		anonymous: {
			creator: typeof anonymous;
		};
	}
}

async function getAnonUserEmail(
	options: AnonymousOptions | undefined,
): Promise<string> {
	const customEmail = await options?.generateRandomEmail?.();
	if (customEmail) {
		const validation = z.email().safeParse(customEmail);
		if (!validation.success) {
			throw APIError.from(
				"BAD_REQUEST",
				ANONYMOUS_ERROR_CODES.INVALID_EMAIL_FORMAT,
			);
		}
		return customEmail;
	}

	const id = generateId();
	if (options?.emailDomainName) {
		return `temp-${id}@${options.emailDomainName}`;
	}

	return `temp@${id}.com`;
}

export const anonymous = (options?: AnonymousOptions | undefined) => {
	return {
		id: "anonymous",
		version: PACKAGE_VERSION,
		endpoints: {
			signInAnonymous: createAuthEndpoint(
				"/sign-in/anonymous",
				{
					method: "POST",
					metadata: {
						openapi: {
							description: "Sign in anonymously",
							responses: {
								200: {
									description: "Sign in anonymously",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user: {
														$ref: "#/components/schemas/User",
													},
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
					// If the current request already has a valid anonymous session, we should
					// reject any further attempts to create another anonymous user. This
					// prevents an anonymous user from signing in anonymously again while they
					// are already authenticated.
					const existingSession = await getSessionFromCtx<{
						isAnonymous: boolean | null;
					}>(ctx, { disableRefresh: true });
					if (existingSession?.user.isAnonymous) {
						throw APIError.from(
							"BAD_REQUEST",
							ANONYMOUS_ERROR_CODES.ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY,
						);
					}

					const email = await getAnonUserEmail(options);
					const name = (await options?.generateName?.(ctx)) || "Anonymous";
					const newUser = await ctx.context.internalAdapter.createUser(
						{
							email,
							emailVerified: false,
							isAnonymous: true,
							name,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						{ method: "anonymous" },
					);
					if (!newUser) {
						throw APIError.from(
							"INTERNAL_SERVER_ERROR",
							ANONYMOUS_ERROR_CODES.FAILED_TO_CREATE_USER,
						);
					}
					const session = await ctx.context.internalAdapter.createSession(
						newUser.id,
					);
					if (!session) {
						throw APIError.from(
							"BAD_REQUEST",
							ANONYMOUS_ERROR_CODES.COULD_NOT_CREATE_SESSION,
						);
					}
					await setSessionCookie(ctx, {
						session,
						user: newUser,
					});
					return ctx.json({
						token: session.token,
						user: parseUserOutput(ctx.context.options, newUser),
					});
				},
			),
			deleteAnonymousUser: createAuthEndpoint(
				"/delete-anonymous-user",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
					metadata: {
						openapi: {
							description: "Delete an anonymous user",
							responses: {
								200: {
									description: "Anonymous user deleted",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
								"400": {
									description: "Anonymous user deletion is disabled",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													message: {
														type: "string",
													},
												},
											},
											required: ["message"],
										},
									},
								},
								"500": {
									description: "Internal server error",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													message: {
														type: "string",
													},
												},
												required: ["message"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const session = ctx.context.session as AnonymousSession;

					if (options?.disableDeleteAnonymousUser) {
						throw APIError.from(
							"BAD_REQUEST",
							ANONYMOUS_ERROR_CODES.DELETE_ANONYMOUS_USER_DISABLED,
						);
					}

					if (!session.user.isAnonymous) {
						throw APIError.from(
							"FORBIDDEN",
							ANONYMOUS_ERROR_CODES.USER_IS_NOT_ANONYMOUS,
						);
					}

					try {
						await ctx.context.internalAdapter.deleteUserSessions(
							session.user.id,
						);
					} catch (error) {
						ctx.context.logger.error(
							"Failed to delete anonymous user sessions",
							error,
						);
						throw APIError.from(
							"INTERNAL_SERVER_ERROR",
							ANONYMOUS_ERROR_CODES.FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS,
						);
					}

					try {
						await ctx.context.internalAdapter.deleteUser(session.user.id);
					} catch (error) {
						ctx.context.logger.error("Failed to delete anonymous user", error);
						throw APIError.from(
							"INTERNAL_SERVER_ERROR",
							ANONYMOUS_ERROR_CODES.FAILED_TO_DELETE_ANONYMOUS_USER,
						);
					}
					deleteSessionCookie(ctx);
					return ctx.json({ success: true });
				},
			),
		},
		hooks: {
			before: [
				{
					matcher(ctx) {
						// Generic OAuth providers also sign in through `/sign-in/social`,
						// so this single path covers them too.
						return ctx.path === "/sign-in/social";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const session = await getSessionFromCtx<{
							isAnonymous: boolean | null;
						}>(ctx, { disableRefresh: true });
						if (!session?.user.isAnonymous) {
							return;
						}
						// Carry the anonymous user id across the provider redirect so the
						// callback can link the account even when the session cookie is
						// absent (for example Expo's in-app browser).
						await addOAuthServerContext({
							anonymousUserId: session.user.id,
						});
					}),
				},
			],
			after: [
				{
					matcher(ctx) {
						return (
							ctx.path?.startsWith("/sign-in") ||
							ctx.path?.startsWith("/sign-up") ||
							ctx.path?.startsWith("/callback") ||
							ctx.path?.startsWith("/magic-link/verify") ||
							ctx.path?.startsWith("/email-otp/verify-email") ||
							ctx.path?.startsWith("/one-tap/callback") ||
							ctx.path?.startsWith("/passkey/verify-authentication") ||
							ctx.path?.startsWith("/phone-number/verify") ||
							ctx.path?.startsWith("/verify-email") ||
							false
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const setCookie = ctx.context.responseHeaders?.get("set-cookie");

						/**
						 * We can consider the user is about to sign in or sign up
						 * if the response contains a session token.
						 */
						const sessionTokenName = ctx.context.authCookies.sessionToken.name;
						/**
						 * The user is about to link their account.
						 */
						const sessionCookie = parseSetCookieHeader(setCookie || "")
							.get(sessionTokenName)
							?.value.split(".")[0]!;

						if (!sessionCookie) {
							return;
						}
						/**
						 * Make sure the user had an anonymous session. Falls back to the
						 * server-only OAuth state when the callback arrives without the
						 * anonymous session cookie (for example Expo).
						 */
						const session = await resolveAnonymousSession(ctx);
						if (!session) {
							return;
						}

						if (ctx.path === "/sign-in/anonymous" && !ctx.context.newSession) {
							throw APIError.from(
								"BAD_REQUEST",
								ANONYMOUS_ERROR_CODES.ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY,
							);
						}
						const newSession = ctx.context.newSession;
						if (!newSession) {
							return;
						}

						// At this point the user is linking their previous anonymous account with a
						// new credential (email / social). Invoke the provided callback so that the
						// integrator can perform any additional logic such as transferring data
						// from the anonymous user to the new user.
						if (options?.onLinkAccount) {
							await options.onLinkAccount({
								anonymousUser: {
									session: session.session,
									user: session.user,
								},
								newUser: newSession,
								ctx,
							});
						}
						const newSessionUser = newSession.user as
							| (UserWithAnonymous & Record<string, any>)
							| undefined;
						const isSameUser = newSessionUser?.id === session.user.id;
						const newSessionIsAnonymous = Boolean(newSessionUser?.isAnonymous);
						if (
							options?.disableDeleteAnonymousUser ||
							isSameUser ||
							newSessionIsAnonymous
						) {
							return;
						}
						try {
							await ctx.context.internalAdapter.deleteUserSessions(
								session.user.id,
							);
							await ctx.context.internalAdapter.deleteUser(session.user.id);
						} catch (error) {
							// TODO: collapse session+user cleanup into `internalAdapter.deleteUser`
							// to remove the partial-state window where sessions are deleted but
							// the user row remains.
							ctx.context.logger.error(
								"Failed to clean up anonymous user during post-link cleanup",
								{ anonymousUserId: session.user.id, error },
							);
						}
					}),
				},
			],
		},
		options,
		schema: mergeSchema(schema, options?.schema),
		$ERROR_CODES: ANONYMOUS_ERROR_CODES,
		ui: {
			capabilities: {
				anonymous: {
					id: "anonymous",
					enabled: true,
					routes: {
						signIn: {
							type: "auth-route",
							path: "/sign-in/anonymous",
							method: "POST",
						},
					},
				},
			},
			settingsCards: anonymousSettingsCards,
		},
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
