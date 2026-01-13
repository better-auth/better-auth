import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { generateId } from "@better-auth/core/utils/id";
import * as z from "zod";
import {
	APIError,
	getSessionFromCtx,
	sensitiveSessionMiddleware,
} from "../../api";
import {
	deleteSessionCookie,
	parseSetCookieHeader,
	setSessionCookie,
} from "../../cookies";
import { mergeSchema } from "../../db/schema";
import { ANONYMOUS_ERROR_CODES } from "./error-codes";
import { schema } from "./schema";
import type {
	AnonymousOptions,
	AnonymousSession,
	UserWithAnonymous,
} from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
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
					const newUser = await ctx.context.internalAdapter.createUser({
						email,
						emailVerified: false,
						isAnonymous: true,
						name,
						createdAt: new Date(),
						updatedAt: new Date(),
					});
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
						return ctx.json(null, {
							status: 400,
							body: {
								message: ANONYMOUS_ERROR_CODES.COULD_NOT_CREATE_SESSION.message,
							},
						});
					}
					await setSessionCookie(ctx, {
						session,
						user: newUser,
					});
					return ctx.json({
						token: session.token,
						user: {
							id: newUser.id,
							email: newUser.email,
							emailVerified: newUser.emailVerified,
							name: newUser.name,
							createdAt: newUser.createdAt,
							updatedAt: newUser.updatedAt,
						},
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
			after: [
				{
					matcher(ctx) {
						return (
							ctx.path?.startsWith("/sign-in") ||
							ctx.path?.startsWith("/sign-up") ||
							ctx.path?.startsWith("/callback") ||
							ctx.path?.startsWith("/oauth2/callback") ||
							ctx.path?.startsWith("/magic-link/verify") ||
							ctx.path?.startsWith("/email-otp/verify-email") ||
							ctx.path?.startsWith("/one-tap/callback") ||
							ctx.path?.startsWith("/passkey/verify-authentication") ||
							ctx.path?.startsWith("/phone-number/verify") ||
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
						 * Make sure the user had an anonymous session.
						 */
						const session = await getSessionFromCtx<{
							isAnonymous: boolean | null;
						}>(ctx, {
							disableRefresh: true,
						});

						if (!session || !session.user.isAnonymous) {
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

						const user = {
							...session.user,
							// Type hack to ensure `isAnonymous` is correctly inferred as true.
							// Without this, `isAnonymous` is inferred as `boolean | null` despite
							// the conditional checks above suggesting otherwise.
							isAnonymous: session.user.isAnonymous,
						};

						// At this point the user is linking their previous anonymous account with a
						// new credential (email / social). Invoke the provided callback so that the
						// integrator can perform any additional logic such as transferring data
						// from the anonymous user to the new user.
						if (options?.onLinkAccount) {
							await options?.onLinkAccount?.({
								anonymousUser: { session: session.session, user },
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
						await ctx.context.internalAdapter.deleteUser(session.user.id);
					}),
				},
			],
		},
		options,
		schema: mergeSchema(schema, options?.schema),
		$ERROR_CODES: ANONYMOUS_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
