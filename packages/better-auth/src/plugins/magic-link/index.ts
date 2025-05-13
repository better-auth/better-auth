import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import { setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { BASE_ERROR_CODES } from "../../error/codes";
import { originCheck } from "../../api";

interface MagicLinkOptions {
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
}

function getSafeBaseURL(
	ctx: any,
	{
		required = false,
		forFunction,
	}: { required?: boolean; forFunction: string } = {
		forFunction: "unknown operation",
	},
): string {
	const baseURL = ctx.context.options.baseURL;

	if (typeof baseURL === "string" && baseURL.trim() !== "") {
		return baseURL.replace(/\/$/, "");
	}

	if (required) {
		throw new Error(
			`Configuration error: 'options.baseURL' is undefined or empty, but it is required for ${forFunction}. Please set a valid baseURL in your BetterAuth options.`,
		);
	}

	console.warn(
		`Warning: 'options.baseURL' is undefined or empty. ${forFunction} will use relative paths or may not function as expected with absolute URLs.`,
	);
	return "";
}

export const magicLink = (options: MagicLinkOptions) => {
	return {
		id: "magic-link",
		endpoints: {
			signInMagicLink: createAuthEndpoint(
				"/sign-in/magic-link",
				{
					method: "POST",
					requireHeaders: true,
					body: z.object({
						email: z
							.string({
								description: "Email address to send the magic link",
							})
							.email(),
						name: z
							.string({
								description:
									"User display name. Only used if the user is registering for the first time.",
							})
							.optional(),
						callbackURL: z
							.string({
								description: "URL to redirect after magic link verification",
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
					const functionName = "magicLink.signInMagicLink";

					if (options.disableSignUp) {
						const user =
							await ctx.context.internalAdapter.findUserByEmail(email);

						if (!user) {
							throw new APIError("BAD_REQUEST", {
								message: BASE_ERROR_CODES.USER_NOT_FOUND,
							});
						}
					}

					const verificationToken = options?.generateToken
						? await options.generateToken(email)
						: generateRandomString(32, "a-z", "A-Z");
					await ctx.context.internalAdapter.createVerificationValue(
						{
							identifier: verificationToken,
							value: JSON.stringify({ email, name: ctx.body.name }),
							expiresAt: new Date(
								Date.now() + (options.expiresIn || 60 * 5) * 1000,
							),
						},
						ctx,
					);

					const hostBaseURL = getSafeBaseURL(ctx, {
						required: true,
						forFunction: `${functionName} (host part of URL)`,
					});

					let apiPathPrefix = "/api/auth";
					if (
						typeof ctx.context.options.basePath === "string" &&
						ctx.context.options.basePath.trim() !== ""
					) {
						apiPathPrefix = ctx.context.options.basePath;
					}
					const normalizedApiPathPrefix = apiPathPrefix.replace(/\/$/, "");

					const fullPublicBaseURL = `${hostBaseURL}${normalizedApiPathPrefix}`;

					const url = `${fullPublicBaseURL}/magic-link/verify?token=${verificationToken}&callbackURL=${encodeURIComponent(
						ctx.body.callbackURL || "/",
					)}`;
					await options.sendMagicLink(
						{
							email,
							url,
							token: verificationToken,
						},
						ctx.request,
					);
					return ctx.json({
						status: true,
					});
				},
			),
			magicLinkVerify: createAuthEndpoint(
				"/magic-link/verify",
				{
					method: "GET",
					query: z.object({
						token: z.string({
							description: "Verification token",
						}),
						callbackURL: z
							.string({
								description:
									"URL to redirect after magic link verification, if not provided will return session",
							})
							.optional(),
					}),
					use: [
						originCheck((ctx) => {
							const functionName = "magicLink.magicLinkVerify.originCheck";
							const encodedCbFromQuery = ctx.query.callbackURL;
							if (typeof encodedCbFromQuery === "string") {
								try {
									return decodeURIComponent(encodedCbFromQuery);
								} catch (e) {
									return "::malformed_callback_url_for_origin_check::";
								}
							}

							const hostForOriginCheck = getSafeBaseURL(ctx, {
								required: false,
								forFunction: functionName,
							});
							let pathForOriginCheck = "/";
							if (
								typeof ctx.context.options.basePath === "string" &&
								ctx.context.options.basePath.trim() !== ""
							) {
								pathForOriginCheck =
									ctx.context.options.basePath.replace(/\/$/, "") + "/";
							} else if (hostForOriginCheck) {
								pathForOriginCheck = "/api/auth/";
							}
							return `${hostForOriginCheck}${pathForOriginCheck}`;
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
					const encodedCallbackURLFromQuery = ctx.query.callbackURL;
					const functionName = "magicLink.magicLinkVerify";

					const appHostBaseURL = getSafeBaseURL(ctx, {
						required: false,
						forFunction: functionName,
					});
					let appPathPrefix = "";
					if (
						typeof ctx.context.options.basePath === "string" &&
						ctx.context.options.basePath.trim() !== ""
					) {
						appPathPrefix = ctx.context.options.basePath.replace(/\/$/, "");
					} else if (appHostBaseURL) {
						appPathPrefix = "/api/auth";
					}
					const appFullBaseURL = `${appHostBaseURL}${appPathPrefix}`;

					let callbackURL: string;

					if (typeof encodedCallbackURLFromQuery === "string") {
						try {
							callbackURL = decodeURIComponent(encodedCallbackURLFromQuery);
						} catch (e) {
							throw ctx.redirect(
								`${appFullBaseURL}/?error=INVALID_CALLBACK_URL_FORMAT`,
							);
						}
					} else {
						callbackURL = "/";
					}

					const toRedirectTo = callbackURL?.startsWith("http")
						? callbackURL
						: callbackURL
							? `${ctx.context.options.baseURL}${callbackURL}`
							: ctx.context.options.baseURL;

					const tokenValue =
						await ctx.context.internalAdapter.findVerificationValue(token);
					if (!tokenValue) {
						throw ctx.redirect(`${toRedirectTo}?error=INVALID_TOKEN`);
					}
					if (tokenValue.expiresAt < new Date()) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							tokenValue.id,
						);
						throw ctx.redirect(`${toRedirectTo}?error=EXPIRED_TOKEN`);
					}
					await ctx.context.internalAdapter.deleteVerificationValue(
						tokenValue.id,
					);
					const { email, name } = JSON.parse(tokenValue.value) as {
						email: string;
						name?: string;
					};
					let user = await ctx.context.internalAdapter
						.findUserByEmail(email)
						.then((res) => res?.user);

					if (!user) {
						if (!options.disableSignUp) {
							const newUser = await ctx.context.internalAdapter.createUser(
								{
									email: email,
									emailVerified: true,
									name: name || "",
								},
								ctx,
							);
							user = newUser;
							if (!user) {
								throw ctx.redirect(
									`${toRedirectTo}?error=failed_to_create_user`,
								);
							}
						} else {
							throw ctx.redirect(
								`${toRedirectTo}?error=USER_NOT_FOUND_OR_SIGNUP_DISABLED`,
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
							`${toRedirectTo}?error=failed_to_create_session`,
						);
					}

					await setSessionCookie(ctx, {
						session,
						user,
					});
					if (encodedCallbackURLFromQuery === undefined) {
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
					} else {
						throw ctx.redirect(callbackURL);
					}
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
				window: options.rateLimit?.window || 60,
				max: options.rateLimit?.max || 5,
			},
		],
	} satisfies BetterAuthPlugin;
};
