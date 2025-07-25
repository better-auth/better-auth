import * as z from "zod/v4";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import { setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { BASE_ERROR_CODES } from "../../error/codes";
import { originCheck } from "../../api";
import { defaultKeyHasher } from "./utils";
import type { GenericEndpointContext } from "../../types";

interface MagicLinkopts {
	/**
	 * Time in seconds until the magic link expires.
	 * @default (60 * 5) // 5 minutes
	 */
	expiresIn?: number;
	/**
	 * Send magic link implementation.
	 */
	sendMagicLink: (
		data: {
			email: string;
			url: string;
			token: string;
		},
		request?: Request,
	) => Promise<void> | void;
	/**
	 * Disable sign up if user is not found.
	 *
	 * @default false
	 */
	disableSignUp?: boolean;
	/**
	 * Rate limit configuration.
	 *
	 * @default {
	 *  window: 60,
	 *  max: 5,
	 * }
	 */
	rateLimit?: {
		window: number;
		max: number;
	};
	/**
	 * Custom function to generate a token
	 */
	generateToken?: (email: string) => Promise<string> | string;

	/**
	 * This option allows you to configure how the token is stored in your database.
	 * Note: This will not affect the token that's sent, it will only affect the token stored in your database.
	 *
	 * @default "plain"
	 */
	storeToken?:
		| "plain"
		| "hashed"
		| { type: "custom-hasher"; hash: (token: string) => Promise<string> };
}

export const magicLink = (options: MagicLinkopts) => {
	const opts = {
		storeToken: "plain",
		...options,
	} satisfies MagicLinkopts;

	async function storeToken(ctx: GenericEndpointContext, token: string) {
		if (opts.storeToken === "hashed") {
			return await defaultKeyHasher(token);
		}
		if (
			typeof opts.storeToken === "object" &&
			"type" in opts.storeToken &&
			opts.storeToken.type === "custom-hasher"
		) {
			return await opts.storeToken.hash(token);
		}
		return token;
	}

	return {
		id: "magic-link",
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * POST `/sign-in/magic-link`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.signInMagicLink`
			 *
			 * **client:**
			 * `authClient.signIn.magicLink`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/sign-in#api-method-sign-in-magic-link)
			 */
			signInMagicLink: createAuthEndpoint(
				"/sign-in/magic-link",
				{
					method: "POST",
					requireHeaders: true,
					body: z.object({
						email: z
							.string()
							.meta({
								description: "Email address to send the magic link",
							})
							.email(),
						name: z
							.string()
							.meta({
								description:
									'User display name. Only used if the user is registering for the first time. Eg: "my-name"',
							})
							.optional(),
						callbackURL: z
							.string()
							.meta({
								description: "URL to redirect after magic link verification",
							})
							.optional(),
						newUserCallbackURL: z
							.string()
							.meta({
								description:
									"URL to redirect after new user signup. Only used if the user is registering for the first time.",
							})
							.optional(),
						errorCallbackURL: z
							.string()
							.meta({
								description: "URL to redirect after error.",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							description: "Sign in with magic link",
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
					const { email } = ctx.body;

					if (opts.disableSignUp) {
						const user =
							await ctx.context.internalAdapter.findUserByEmail(email);

						if (!user) {
							throw new APIError("BAD_REQUEST", {
								message: BASE_ERROR_CODES.USER_NOT_FOUND,
							});
						}
					}

					const verificationToken = opts?.generateToken
						? await opts.generateToken(email)
						: generateRandomString(32, "a-z", "A-Z");
					const storedToken = await storeToken(ctx, verificationToken);
					await ctx.context.internalAdapter.createVerificationValue(
						{
							identifier: storedToken,
							value: JSON.stringify({ email, name: ctx.body.name }),
							expiresAt: new Date(
								Date.now() + (opts.expiresIn || 60 * 5) * 1000,
							),
						},
						ctx,
					);
					const realBaseURL = new URL(ctx.context.baseURL);
					const url = new URL(
						`${realBaseURL.pathname}/magic-link/verify`,
						realBaseURL.origin,
					);
					url.searchParams.set("token", verificationToken);
					url.searchParams.set("callbackURL", ctx.body.callbackURL || "/");
					if (ctx.body.newUserCallbackURL) {
						url.searchParams.set(
							"newUserCallbackURL",
							ctx.body.newUserCallbackURL,
						);
					}
					if (ctx.body.errorCallbackURL) {
						url.searchParams.set("errorCallbackURL", ctx.body.errorCallbackURL);
					}
					await options.sendMagicLink(
						{
							email,
							url: url.toString(),
							token: verificationToken,
						},
						ctx.request,
					);
					return ctx.json({
						status: true,
					});
				},
			),
			/**
			 * ### Endpoint
			 *
			 * GET `/magic-link/verify`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.magicLinkVerify`
			 *
			 * **client:**
			 * `authClient.magicLink.verify`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/magic-link#api-method-magic-link-verify)
			 */
			magicLinkVerify: createAuthEndpoint(
				"/magic-link/verify",
				{
					method: "GET",
					query: z.object({
						token: z.string().meta({
							description: "Verification token",
						}),
						callbackURL: z
							.string()
							.meta({
								description:
									'URL to redirect after magic link verification, if not provided the user will be redirected to the root URL. Eg: "/dashboard"',
							})
							.optional(),
						errorCallbackURL: z
							.string()
							.meta({
								description: "URL to redirect after error.",
							})
							.optional(),
						newUserCallbackURL: z
							.string()
							.meta({
								description:
									"URL to redirect after new user signup. Only used if the user is registering for the first time.",
							})
							.optional(),
					}),
					use: [
						originCheck((ctx) => {
							return ctx.query.callbackURL
								? decodeURIComponent(ctx.query.callbackURL)
								: "/";
						}),
						originCheck((ctx) => {
							return ctx.query.newUserCallbackURL
								? decodeURIComponent(ctx.query.newUserCallbackURL)
								: "/";
						}),
						originCheck((ctx) => {
							return ctx.query.errorCallbackURL
								? decodeURIComponent(ctx.query.errorCallbackURL)
								: "/";
						}),
					],
					requireHeaders: true,
					metadata: {
						openapi: {
							description: "Verify magic link",
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
													user: {
														$ref: "#/components/schemas/User",
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
					const token = ctx.query.token;
					// If the first argument provides the origin, it will ignore the second argument of `new URL`.
					// new URL("http://localhost:3001/hello", "http://localhost:3000").toString()
					// Returns http://localhost:3001/hello
					const callbackURL = new URL(
						ctx.query.callbackURL
							? decodeURIComponent(ctx.query.callbackURL)
							: "/",
						ctx.context.baseURL,
					).toString();
					const errorCallbackURL = new URL(
						ctx.query.errorCallbackURL
							? decodeURIComponent(ctx.query.errorCallbackURL)
							: callbackURL,
						ctx.context.baseURL,
					).toString();
					const newUserCallbackURL = new URL(
						ctx.query.newUserCallbackURL
							? decodeURIComponent(ctx.query.newUserCallbackURL)
							: callbackURL,
						ctx.context.baseURL,
					).toString();
					const toRedirectTo = callbackURL?.startsWith("http")
						? callbackURL
						: callbackURL
							? `${ctx.context.options.baseURL}${callbackURL}`
							: ctx.context.options.baseURL;
					const storedToken = await storeToken(ctx, token);
					const tokenValue =
						await ctx.context.internalAdapter.findVerificationValue(
							storedToken,
						);
					if (!tokenValue) {
						throw ctx.redirect(`${errorCallbackURL}?error=INVALID_TOKEN`);
					}
					if (tokenValue.expiresAt < new Date()) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							tokenValue.id,
						);
						throw ctx.redirect(`${errorCallbackURL}?error=EXPIRED_TOKEN`);
					}
					await ctx.context.internalAdapter.deleteVerificationValue(
						tokenValue.id,
					);
					const { email, name } = JSON.parse(tokenValue.value) as {
						email: string;
						name?: string;
					};
					let isNewUser = false;
					let user = await ctx.context.internalAdapter
						.findUserByEmail(email)
						.then((res) => res?.user);

					if (!user) {
						if (!opts.disableSignUp) {
							const newUser = await ctx.context.internalAdapter.createUser(
								{
									email: email,
									emailVerified: true,
									name: name || "",
								},
								ctx,
							);
							isNewUser = true;
							user = newUser;
							if (!user) {
								throw ctx.redirect(
									`${errorCallbackURL}?error=failed_to_create_user`,
								);
							}
						} else {
							throw ctx.redirect(
								`${errorCallbackURL}?error=new_user_signup_disabled`,
							);
						}
					}

					if (!user.emailVerified) {
						await ctx.context.internalAdapter.updateUser(
							user.id,
							{
								emailVerified: true,
							},
							ctx,
						);
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx,
					);

					if (!session) {
						throw ctx.redirect(
							`${errorCallbackURL}?error=failed_to_create_session`,
						);
					}

					await setSessionCookie(ctx, {
						session,
						user,
					});
					if (!ctx.query.callbackURL) {
						return ctx.json({
							token: session.token,
							user: {
								id: user.id,
								email: user.email,
								emailVerified: user.emailVerified,
								name: user.name,
								image: user.image,
								createdAt: user.createdAt,
								updatedAt: user.updatedAt,
							},
						});
					}
					if (isNewUser) {
						throw ctx.redirect(newUserCallbackURL);
					}
					throw ctx.redirect(callbackURL);
				},
			),
		},
		rateLimit: [
			{
				pathMatcher(path) {
					return (
						path.startsWith("/sign-in/magic-link") ||
						path.startsWith("/magic-link/verify")
					);
				},
				window: opts.rateLimit?.window || 60,
				max: opts.rateLimit?.max || 5,
			},
		],
	} satisfies BetterAuthPlugin;
};
