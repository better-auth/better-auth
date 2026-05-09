import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { JWTPayload, JWTVerifyResult } from "jose";
import { jwtVerify } from "jose";
import { JWTExpired } from "jose/errors";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { signJWT } from "../../crypto/jwt";
import { parseUserOutput } from "../../db/schema";
import type { User } from "../../types";
import { getDate } from "../../utils/date";
import { originCheck } from "../middlewares";
import { getSessionFromCtx } from "./session";

/**
 * Derive a stable, short identifier for a JWT token so we can
 * track whether it has already been consumed.  We use the first
 * 43 characters of the base64url-encoded SHA-256 digest of the
 * raw token string (≈ 256 bits of entropy, URL-safe, no padding).
 */
async function getTokenIdentifier(token: string): Promise<string> {
	const encoded = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const base64 = btoa(String.fromCharCode(...hashArray))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return `used-email-token:${base64}`;
}

export async function createEmailVerificationToken(
	secret: string,
	email: string,
	/**
	 * The email to update from
	 */
	updateTo?: string | undefined,
	/**
	 * The time in seconds for the token to expire
	 */
	expiresIn: number = 3600,
	/**
	 * Extra payload to include in the token
	 */
	extraPayload?: Record<string, any>,
) {
	const token = await signJWT(
		{
			email: email.toLowerCase(),
			updateTo: updateTo?.toLowerCase(),
			...extraPayload,
		},
		secret,
		expiresIn,
	);
	return token;
}

/**
 * A function to send a verification email to the user
 */
export async function sendVerificationEmailFn(
	ctx: GenericEndpointContext,
	user: User,
) {
	if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
		ctx.context.logger.error("Verification email isn't enabled.");
		throw APIError.from(
			"BAD_REQUEST",
			BASE_ERROR_CODES.VERIFICATION_EMAIL_NOT_ENABLED,
		);
	}
	const token = await createEmailVerificationToken(
		ctx.context.secret,
		user.email,
		undefined,
		ctx.context.options.emailVerification?.expiresIn,
	);
	const callbackURL = ctx.body.callbackURL
		? encodeURIComponent(ctx.body.callbackURL)
		: encodeURIComponent("/");
	const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
	await ctx.context.runInBackgroundOrAwait(
		ctx.context.options.emailVerification.sendVerificationEmail(
			{
				user: user,
				url,
				token,
			},
			ctx.request,
		),
	);
}
export const sendVerificationEmail = createAuthEndpoint(
	"/send-verification-email",
	{
		method: "POST",
		operationId: "sendVerificationEmail",
		body: z.object({
			email: z.email().meta({
				description: "The email to send the verification email to",
			}),
			callbackURL: z
				.string()
				.meta({
					description: "The URL to use for email verification callback",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				operationId: "sendVerificationEmail",
				description: "Send a verification email to the user",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									email: {
										type: "string",
										description: "The email to send the verification email to",
										example: "user@example.com",
									},
									callbackURL: {
										type: "string",
										description:
											"The URL to use for email verification callback",
										example: "https://example.com/callback",
										nullable: true,
									},
								},
								required: ["email"],
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
											description:
												"Indicates if the email was sent successfully",
											example: true,
										},
									},
								},
							},
						},
					},
					"400": {
						description: "Bad Request",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										message: {
											type: "string",
											description: "Error message",
											example: "Verification email isn't enabled",
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
		if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
			ctx.context.logger.error("Verification email isn't enabled.");
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.VERIFICATION_EMAIL_NOT_ENABLED,
			);
		}
		const { email } = ctx.body;
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user || user.user.emailVerified) {
				await createEmailVerificationToken(
					ctx.context.secret,
					email,
					undefined,
					ctx.context.options.emailVerification?.expiresIn,
				);
				// We're returning true to avoid leaking information about the user
				return ctx.json({
					status: true,
				});
			}
			await sendVerificationEmailFn(ctx, user.user);
			return ctx.json({
				status: true,
			});
		}
		if (session?.user.email.toLowerCase() !== email.toLowerCase()) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.EMAIL_MISMATCH);
		}
		if (session?.user.emailVerified) {
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.EMAIL_ALREADY_VERIFIED,
			);
		}
		await sendVerificationEmailFn(ctx, session.user);
		return ctx.json({
			status: true,
		});
	},
);

export const verifyEmail = createAuthEndpoint(
	"/verify-email",
	{
		method: "GET",
		operationId: "verifyEmail",
		query: z.object({
			token: z.string().meta({
				description: "The token to verify the email",
			}),
			callbackURL: z
				.string()
				.meta({
					description: "The URL to redirect to after email verification",
				})
				.optional(),
		}),
		use: [originCheck((ctx) => ctx.query.callbackURL)],
		metadata: {
			openapi: {
				description: "Verify the email of the user",
				parameters: [
					{
						name: "token",
						in: "query",
						description: "The token to verify the email",
						required: true,
						schema: {
							type: "string",
						},
					},
					{
						name: "callbackURL",
						in: "query",
						description: "The URL to redirect to after email verification",
						required: false,
						schema: {
							type: "string",
						},
					},
				],
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										user: {
											type: "object",
											$ref: "#/components/schemas/User",
										},
										status: {
											type: "boolean",
											description:
												"Indicates if the email was verified successfully",
										},
									},
									required: ["user", "status"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		function redirectOnError(error: { code: string; message: string }) {
			if (ctx.query.callbackURL) {
				if (ctx.query.callbackURL.includes("?")) {
					throw ctx.redirect(`${ctx.query.callbackURL}&error=${error.code}`);
				}
				throw ctx.redirect(`${ctx.query.callbackURL}?error=${error.code}`);
			}
			throw APIError.from("UNAUTHORIZED", error);
		}
		const { token } = ctx.query;
		let jwt: JWTVerifyResult<JWTPayload>;
		try {
			jwt = await jwtVerify(
				token,
				new TextEncoder().encode(ctx.context.secret),
				{
					algorithms: ["HS256"],
				},
			);
		} catch (e) {
			if (e instanceof JWTExpired) {
				return redirectOnError(BASE_ERROR_CODES.TOKEN_EXPIRED);
			}
			return redirectOnError(BASE_ERROR_CODES.INVALID_TOKEN);
		}
		const schema = z.object({
			email: z.email(),
			updateTo: z.string().optional(),
			requestType: z.string().optional(),
		});
		const parsed = schema.parse(jwt.payload);
		/**
		 * Enforce single-use for change-email tokens BEFORE any DB lookups.
		 * JWT-based tokens are stateless so they remain cryptographically valid
		 * until expiry. We store a record of consumed tokens in the verification
		 * table so replaying the same link is rejected immediately — even after
		 * the email has already been updated in the DB (which would otherwise
		 * cause a misleading USER_NOT_FOUND error on reuse).
		 *
		 * @see https://github.com/better-auth/better-auth/issues/9479
		 */
		if (
			parsed.updateTo &&
			(parsed.requestType === "change-email-confirmation" ||
				parsed.requestType === "change-email-verification")
		) {
			const tokenIdentifier = await getTokenIdentifier(token);
			const alreadyUsed =
				await ctx.context.internalAdapter.findVerificationValue(
					tokenIdentifier,
				);
			if (alreadyUsed) {
				return redirectOnError(BASE_ERROR_CODES.TOKEN_ALREADY_USED);
			}
			await ctx.context.internalAdapter.createVerificationValue({
				identifier: tokenIdentifier,
				value: "used",
				expiresAt: getDate(
					ctx.context.options.emailVerification?.expiresIn ?? 3600,
					"sec",
				),
			});
		}
		const user = await ctx.context.internalAdapter.findUserByEmail(
			parsed.email,
		);
		if (!user) {
			return redirectOnError(BASE_ERROR_CODES.USER_NOT_FOUND);
		}
		if (parsed.updateTo) {
			const session = await getSessionFromCtx(ctx);
			if (session && session.user.email !== parsed.email) {
				return redirectOnError(BASE_ERROR_CODES.INVALID_USER);
			}
			switch (parsed.requestType) {
				/**
				 * User clicks confirmation -> sends verification to new email
				 */
				case "change-email-confirmation": {
					const newToken = await createEmailVerificationToken(
						ctx.context.secret,
						parsed.email,
						parsed.updateTo,
						ctx.context.options.emailVerification?.expiresIn,
						{ requestType: "change-email-verification" },
					);
					const updateCallbackURL = ctx.query.callbackURL
						? encodeURIComponent(ctx.query.callbackURL)
						: encodeURIComponent("/");
					const url = `${ctx.context.baseURL}/verify-email?token=${newToken}&callbackURL=${updateCallbackURL}`;
					if (ctx.context.options.emailVerification?.sendVerificationEmail) {
						await ctx.context.runInBackgroundOrAwait(
							ctx.context.options.emailVerification.sendVerificationEmail(
								{
									user: { ...user.user, email: parsed.updateTo },
									url,
									token: newToken,
								},
								ctx.request,
							),
						);
					}
					if (ctx.query.callbackURL) {
						throw ctx.redirect(ctx.query.callbackURL);
					}
					return ctx.json({ status: true });
				}
				/**
				 * User clicks verification -> updates email
				 */
				case "change-email-verification": {
					let activeSession = session;
					if (!activeSession) {
						const newSession = await ctx.context.internalAdapter.createSession(
							user.user.id,
						);
						if (!newSession) {
							throw APIError.from(
								"INTERNAL_SERVER_ERROR",
								BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
							);
						}
						activeSession = {
							session: newSession,
							user: user.user,
						};
					}
					const updatedUser =
						await ctx.context.internalAdapter.updateUserByEmail(parsed.email, {
							email: parsed.updateTo,
							emailVerified: true,
						});
					if (ctx.context.options.emailVerification?.afterEmailVerification) {
						await ctx.context.options.emailVerification.afterEmailVerification(
							updatedUser,
							ctx.request,
						);
					}
					await setSessionCookie(ctx, {
						session: activeSession.session,
						user: {
							...activeSession.user,
							email: parsed.updateTo,
							emailVerified: true,
						},
					});
					if (ctx.query.callbackURL) {
						throw ctx.redirect(ctx.query.callbackURL);
					}
					return ctx.json({
						status: true,
						user: parseUserOutput(ctx.context.options, updatedUser),
					});
				}
				/**
				 * Legacy flow
				 *
				 * - skips two-step verification
				 * - updates email immediately
				 */
				default: {
					let activeSession = session;
					if (!activeSession) {
						const newSession = await ctx.context.internalAdapter.createSession(
							user.user.id,
						);
						if (!newSession) {
							throw APIError.from(
								"INTERNAL_SERVER_ERROR",
								BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
							);
						}
						activeSession = {
							session: newSession,
							user: user.user,
						};
					}
					const updatedUser =
						await ctx.context.internalAdapter.updateUserByEmail(parsed.email, {
							email: parsed.updateTo,
							emailVerified: false,
						});
					const newToken = await createEmailVerificationToken(
						ctx.context.secret,
						parsed.updateTo,
					);
					const updateCallbackURL = ctx.query.callbackURL
						? encodeURIComponent(ctx.query.callbackURL)
						: encodeURIComponent("/");
					if (ctx.context.options.emailVerification?.sendVerificationEmail) {
						await ctx.context.runInBackgroundOrAwait(
							ctx.context.options.emailVerification.sendVerificationEmail(
								{
									user: updatedUser,
									url: `${ctx.context.baseURL}/verify-email?token=${newToken}&callbackURL=${updateCallbackURL}`,
									token: newToken,
								},
								ctx.request,
							),
						);
					}
					await setSessionCookie(ctx, {
						session: activeSession.session,
						user: {
							...activeSession.user,
							email: parsed.updateTo,
							emailVerified: false,
						},
					});
					if (ctx.query.callbackURL) {
						throw ctx.redirect(ctx.query.callbackURL);
					}
					return ctx.json({
						status: true,
						user: parseUserOutput(ctx.context.options, updatedUser),
					});
				}
			}
		}
		if (user.user.emailVerified) {
			if (ctx.query.callbackURL) {
				throw ctx.redirect(ctx.query.callbackURL);
			}
			return ctx.json({
				status: true,
				user: null,
			});
		}
		if (ctx.context.options.emailVerification?.beforeEmailVerification) {
			await ctx.context.options.emailVerification.beforeEmailVerification(
				user.user,
				ctx.request,
			);
		}
		const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(
			parsed.email,
			{
				emailVerified: true,
			},
		);
		if (ctx.context.options.emailVerification?.afterEmailVerification) {
			await ctx.context.options.emailVerification.afterEmailVerification(
				updatedUser,
				ctx.request,
			);
		}
		if (ctx.context.options.emailVerification?.autoSignInAfterVerification) {
			const currentSession = await getSessionFromCtx(ctx);
			if (!currentSession || currentSession.user.email !== parsed.email) {
				const session = await ctx.context.internalAdapter.createSession(
					user.user.id,
				);
				if (!session) {
					throw APIError.from(
						"INTERNAL_SERVER_ERROR",
						BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
					);
				}
				await setSessionCookie(ctx, {
					session,
					user: {
						...user.user,
						emailVerified: true,
					},
				});
			} else {
				await setSessionCookie(ctx, {
					session: currentSession.session,
					user: {
						...currentSession.user,
						emailVerified: true,
					},
				});
			}
		}

		if (ctx.query.callbackURL) {
			throw ctx.redirect(ctx.query.callbackURL);
		}
		return ctx.json({
			status: true,
			user: null,
		});
	},
);
