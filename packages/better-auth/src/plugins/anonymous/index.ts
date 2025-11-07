import type {
	AuthContext,
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { defineErrorCodes } from "@better-auth/core/utils";
import type { EndpointContext } from "better-call";
import { APIError, getSessionFromCtx } from "../../api";
import { parseSetCookieHeader, setSessionCookie } from "../../cookies";
import { mergeSchema } from "../../db/schema";
import type { InferOptionSchema, Session, User } from "../../types";
import { generateId } from "../../utils/id";
import { getOrigin } from "../../utils/url";

export interface UserWithAnonymous extends User {
	isAnonymous: boolean;
}
export interface AnonymousOptions {
	/**
	 * Configure the domain name of the temporary email
	 * address for anonymous users in the database.
	 * @default "baseURL"
	 */
	emailDomainName?: string | undefined;
	/**
	 * A useful hook to run after an anonymous user
	 * is about to link their account.
	 */
	onLinkAccount?:
		| ((data: {
				anonymousUser: {
					user: UserWithAnonymous & Record<string, any>;
					session: Session & Record<string, any>;
				};
				newUser: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
				};
				ctx: GenericEndpointContext;
		  }) => Promise<void> | void)
		| undefined;
	/**
	 * Disable deleting the anonymous user after linking
	 */
	disableDeleteAnonymousUser?: boolean | undefined;
	/**
	 * A hook to generate a name for the anonymous user.
	 * Useful if you want to have random names for anonymous users, or if `name` is unique in your database.
	 * @returns The name for the anonymous user.
	 */
	generateName?:
		| ((
				ctx: EndpointContext<
					"/sign-in/anonymous",
					{
						method: "POST";
					},
					AuthContext
				>,
		  ) => Promise<string> | string)
		| undefined;
	/**
	 * Custom schema for the anonymous plugin
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
}

const schema = {
	user: {
		fields: {
			isAnonymous: {
				type: "boolean",
				required: false,
				input: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

const ERROR_CODES = defineErrorCodes({
	FAILED_TO_CREATE_USER: "Failed to create user",
	COULD_NOT_CREATE_SESSION: "Could not create session",
	ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
		"Anonymous users cannot sign in again anonymously",
});

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
						isAnonymous: boolean;
					}>(ctx, { disableRefresh: true });
					if (existingSession?.user.isAnonymous) {
						throw new APIError("BAD_REQUEST", {
							message:
								ERROR_CODES.ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY,
						});
					}

					const { emailDomainName = getOrigin(ctx.context.baseURL) } =
						options || {};
					const id = generateId();
					const email = `temp-${id}@${emailDomainName}`;
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
						throw ctx.error("INTERNAL_SERVER_ERROR", {
							message: ERROR_CODES.FAILED_TO_CREATE_USER,
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						newUser.id,
					);
					if (!session) {
						return ctx.json(null, {
							status: 400,
							body: {
								message: ERROR_CODES.COULD_NOT_CREATE_SESSION,
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
		},
		hooks: {
			after: [
				{
					matcher(ctx) {
						return (
							ctx.path.startsWith("/sign-in") ||
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
						const session = await getSessionFromCtx<{ isAnonymous: boolean }>(
							ctx,
							{
								disableRefresh: true,
							},
						);

						if (!session || !session.user.isAnonymous) {
							return;
						}

						if (ctx.path === "/sign-in/anonymous" && !ctx.context.newSession) {
							throw new APIError("BAD_REQUEST", {
								message:
									ERROR_CODES.ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY,
							});
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
							await options?.onLinkAccount?.({
								anonymousUser: session,
								newUser: newSession,
								ctx,
							});
						}
						if (!options?.disableDeleteAnonymousUser) {
							await ctx.context.internalAdapter.deleteUser(session.user.id);
						}
					}),
				},
			],
		},
		schema: mergeSchema(schema, options?.schema),
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
