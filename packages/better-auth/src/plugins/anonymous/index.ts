import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
} from "../../api";
import type {
	BetterAuthPlugin,
	InferOptionSchema,
	PluginSchema,
	Session,
	User,
} from "../../types";
import { parseSetCookieHeader, setSessionCookie } from "../../cookies";
import { getOrigin } from "../../utils/url";
import { mergeSchema } from "../../db/schema";

export interface UserWithAnonymous extends User {
	isAnonymous: boolean;
}
export interface AnonymousOptions {
	/**
	 * Configure the domain name of the temporary email
	 * address for anonymous users in the database.
	 * @default "baseURL"
	 */
	emailDomainName?: string;
	/**
	 * A useful hook to run after an anonymous user
	 * is about to link their account.
	 */
	onLinkAccount?: (data: {
		anonymousUser: {
			user: UserWithAnonymous;
			session: Session;
		};
		newUser: {
			user: User;
			session: Session;
		};
	}) => Promise<void> | void;
	/**
	 * Disable deleting the anonymous user after linking
	 */
	disableDeleteAnonymousUser?: boolean;
	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<typeof schema>;
}

const schema = {
	user: {
		fields: {
			isAnonymous: {
				type: "boolean",
				required: false,
			},
		},
	},
} satisfies PluginSchema;

export const anonymous = (options?: AnonymousOptions) => {
	const ERROR_CODES = {
		FAILED_TO_CREATE_USER: "Failed to create user",
		COULD_NOT_CREATE_SESSION: "Could not create session",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonymous users cannot sign in again anonymously",
	} as const;
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
					const { emailDomainName = getOrigin(ctx.context.baseURL) } =
						options || {};
					const id = ctx.context.generateId({ model: "user" });
					const email = `temp-${id}@${emailDomainName}`;
					const newUser = await ctx.context.internalAdapter.createUser({
						id,
						email,
						emailVerified: false,
						isAnonymous: true,
						name: "Anonymous",
						createdAt: new Date(),
						updatedAt: new Date(),
					});
					if (!newUser) {
						return ctx.json(null, {
							status: 500,
							body: {
								message: ERROR_CODES.FAILED_TO_CREATE_USER,
								status: 500,
							},
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						newUser.id,
						ctx.request,
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
					});
				},
			),
		},
		hooks: {
			after: [
				{
					matcher(context) {
						const setCookie = context.responseHeader.get("set-cookie");
						const hasSessionToken = setCookie?.includes(
							context.context.authCookies.sessionToken.name,
						);
						return !!hasSessionToken;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const headers = ctx.responseHeader;
						const setCookie = headers.get("set-cookie");
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
							?.value.split(".")[0];

						if (!sessionCookie) {
							return;
						}
						/**
						 * Make sure the use had an anonymous session.
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

						if (ctx.path === "/sign-in/anonymous") {
							throw new APIError("BAD_REQUEST", {
								message:
									ERROR_CODES.ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY,
							});
						}
						const newSession = ctx.context.newSession;
						if (!newSession) {
							return;
						}
						if (options?.onLinkAccount) {
							await options?.onLinkAccount?.({
								anonymousUser: session,
								newUser: newSession,
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
