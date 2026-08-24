import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
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

/**
 * Outcome of an in-place promotion attempt (`onLink: "promote"`):
 *
 * - `promoted`: the anonymous user was upgraded in place.
 * - `skipped`: the credential resolved to a pre-existing user, so the caller
 *   should fall back to the classic link flow (`onLinkAccount` + delete).
 * - `failed`: promotion errored midway; the caller must not run the
 *   destructive fallback so the anonymous user's data stays intact.
 */
type PromotionOutcome = "promoted" | "skipped" | "failed";

/**
 * Upgrades the anonymous user in place with a credential that was just linked
 * (`onLink: "promote"`).
 *
 * Promotion only applies when the incoming credential created a brand-new user
 * during this request. That is detected with two fail-safe checks:
 *
 * 1. The new user's `createdAt` is not older than the new session's
 *    `createdAt`. Every sign-up flow creates the user before its session, so a
 *    freshly registered row always satisfies this; a pre-existing account does
 *    not.
 * 2. The new user owns no session other than the one this request just created.
 *
 * On success the anonymous row is updated with the credential's identity and
 * `isAnonymous` is cleared, the freshly created account rows are re-pointed at
 * the anonymous user's id, and the new session is re-pointed so the cookie that
 * was already written keeps working against the promoted user. The transient
 * second user row is removed inside the same transaction, so applications
 * observe exactly one stable user id and need no data migration.
 */
async function promoteAnonymousUser(
	ctx: GenericEndpointContext,
	anonymousUserId: string,
	newSession: {
		session: Session & Record<string, any>;
		user: User & Record<string, any>;
	},
): Promise<PromotionOutcome> {
	const internalAdapter = ctx.context.internalAdapter;
	const newUser = newSession.user;
	const sessionCreatedAt = new Date(newSession.session.createdAt).getTime();
	if (
		!Number.isFinite(sessionCreatedAt) ||
		new Date(newUser.createdAt).getTime() < sessionCreatedAt
	) {
		return "skipped";
	}
	const sessions = await internalAdapter.listSessions(newUser.id);
	if (sessions.some((s) => s.token !== newSession.session.token)) {
		return "skipped";
	}
	try {
		await runWithTransaction(ctx.context.adapter, async () => {
			// Re-point the freshly created provider/credential accounts at the
			// anonymous user before the row that owned them is folded away.
			const accounts = await internalAdapter.findAccounts(newUser.id);
			for (const account of accounts) {
				await internalAdapter.updateAccount(account.id, {
					userId: anonymousUserId,
				});
			}
			// Keep the already-written session cookie valid by moving the new
			// session itself to the promoted user instead of recreating it.
			await internalAdapter.updateSession(newSession.session.token, {
				userId: anonymousUserId,
			});
			// Drop the transient row before writing the promoted identity so a
			// unique email index never sees both rows at once. Deleted through the
			// raw adapter on purpose: nothing references it anymore, and folding a
			// duplicate must not fire user-delete hooks or session cleanups.
			await (await getCurrentAdapter(ctx.context.adapter)).delete({
				model: "user",
				where: [{ field: "id", value: newUser.id }],
			});
			const updates: Record<string, any> = {
				email: newUser.email,
				emailVerified: Boolean(newUser.emailVerified),
				isAnonymous: false,
				updatedAt: new Date(),
			};
			if (typeof newUser.name === "string" && newUser.name.length > 0) {
				updates.name = newUser.name;
			}
			if (typeof newUser.image === "string" && newUser.image.length > 0) {
				updates.image = newUser.image;
			}
			const promotedUser = await internalAdapter.updateUser(
				anonymousUserId,
				updates,
			);
			// Keep the response payload consistent with what was persisted.
			Object.assign(newSession.user, promotedUser ?? updates);
			newSession.session.userId = anonymousUserId;
		});
		return "promoted";
	} catch (error) {
		ctx.context.logger.error(
			"Failed to promote anonymous user in place",
			error,
		);
		return "failed";
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

						const newSessionUser = newSession.user as
							| (UserWithAnonymous & Record<string, any>)
							| undefined;
						const isSameUser = newSessionUser?.id === session.user.id;
						const newSessionIsAnonymous = Boolean(newSessionUser?.isAnonymous);
						if (
							options?.onLink === "promote" &&
							!isSameUser &&
							!newSessionIsAnonymous
						) {
							const outcome = await promoteAnonymousUser(
								ctx,
								session.user.id,
								newSession,
							);
							if (outcome !== "skipped") {
								// Promoted: done. Failed: keep both rows intact rather
								// than risk anonymous data via the destructive fallback.
								return;
							}
							// The credential resolved to an existing user — a real merge.
							// Fall through to the create-and-migrate flow below.
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
						if (
							options?.disableDeleteAnonymousUser ||
							isSameUser ||
							newSessionIsAnonymous
						) {
							return;
						}
						try {
							await ctx.context.internalAdapter.deleteUser(session.user.id);
						} catch (error) {
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
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
