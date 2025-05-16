import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import { setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { BASE_ERROR_CODES } from "../../error/codes";
import { originCheck } from "../../api";
import { redirectErrorURL } from "./utils";

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
						errorCallbackURL: z
							.string({
								description: "The URL to redirect to if an error occurs",
							})
							.optional(),
						newUserCallbackURL: z
							.string({
								description:
									"The URL to redirect to after login if the user is new",
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
					const { email, callbackURL, errorCallbackURL, newUserCallbackURL } =
						ctx.body;

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
					const url =
						`${ctx.context.baseURL}/magic-link/verify?token=${verificationToken}` +
						`&callbackURL=${encodeURIComponent(callbackURL || "/")}` +
						(errorCallbackURL
							? `&errorCallbackURL=${encodeURIComponent(errorCallbackURL)}`
							: "") +
						(newUserCallbackURL
							? `&newUserCallbackURL=${encodeURIComponent(newUserCallbackURL)}`
							: "");
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
						errorCallbackURL: z
							.string({
								description: "The URL to redirect to if an error occurs",
							})
							.optional(),
						newUserCallbackURL: z
							.string({
								description:
									"The URL to redirect to after login if the user is new",
							})
							.optional(),
					}),
					// Extended originCheck to validate all redirect URLs
					use: [
						originCheck((ctx) =>
							[
								ctx.query.callbackURL,
								ctx.query.errorCallbackURL,
								ctx.query.newUserCallbackURL,
							].filter(Boolean),
						),
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
					const { token, callbackURL, errorCallbackURL, newUserCallbackURL } =
						ctx.query;

					const defaultRedirectURL = callbackURL?.startsWith("http")
						? callbackURL
						: callbackURL
							? `${ctx.context.options.baseURL}${callbackURL}`
							: (ctx.context.options.baseURL as string);
					const toRedirectTo = errorCallbackURL?.startsWith("http")
						? errorCallbackURL
						: errorCallbackURL
							? `${ctx.context.options.baseURL}${errorCallbackURL}`
							: defaultRedirectURL;

					const tokenValue =
						await ctx.context.internalAdapter.findVerificationValue(token);
					if (!tokenValue) {
						throw ctx.redirect(redirectErrorURL(toRedirectTo, "INVALID_TOKEN"));
					}
					if (tokenValue.expiresAt < new Date()) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							tokenValue.id,
						);
						throw ctx.redirect(redirectErrorURL(toRedirectTo, "EXPIRED_TOKEN"));
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

					let isNewUser = false;
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
							isNewUser = true;
							if (!user) {
								throw ctx.redirect(
									redirectErrorURL(toRedirectTo, "failed_to_create_user"),
								);
							}
						} else {
							throw ctx.redirect(
								redirectErrorURL(toRedirectTo, "failed_to_create_user"),
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
							redirectErrorURL(toRedirectTo, "failed_to_create_session"),
						);
					}

					await setSessionCookie(ctx, {
						session,
						user,
					});
					if (isNewUser && newUserCallbackURL) {
						throw ctx.redirect(newUserCallbackURL);
					}

					if (!callbackURL) {
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
				window: options.rateLimit?.window || 60,
				max: options.rateLimit?.max || 5,
			},
		],
	} satisfies BetterAuthPlugin;
};
