import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { appendQueryParams } from "@better-auth/core/utils/url";
import type { JWTPayload, JWTVerifyResult } from "jose";
import { jwtVerify } from "jose";
import { JWTExpired } from "jose/errors";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { signJWT } from "../../crypto/jwt";
import { parseUserOutput } from "../../db/schema";
import type { User } from "../../types";
import { safeCloneRequest } from "../../utils/request";
import { originCheck } from "../middlewares";
import { getSessionFromCtx } from "./session";

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
		{ userId: user.id },
	);
	const callbackURL = ctx.body.callbackURL
		? encodeURIComponent(ctx.body.callbackURL)
		: encodeURIComponent("/");
	const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
	// Await directly: `runInBackgroundOrAwait` may defer work or swallow errors (see #8757).
	// This path only runs once a real unverified user is known, so timing here does not weaken the unauthenticated anti-enumeration behavior above.
	await ctx.context.options.emailVerification.sendVerificationEmail(
		{
			user: user,
			url,
			token,
		},
		ctx.request,
	);
}
export const sendVerificationEmail = createAuthEndpoint(
	"/send-verification-email",
	{
		method: "POST",
		operationId: "sendVerificationEmail",
		cloneRequest: true,
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
			/**
			 * Enforce a constant-time floor so an attacker cannot distinguish
			 * "email not found / already verified" (fast local JWT sign) from
			 * "email found and unverified" (slow external email-send) by
			 * comparing response times.
			 */
			const MINIMUM_MS = 500;
			const start = Date.now();
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			let error: unknown;
			if (!user || user.user.emailVerified) {
				await createEmailVerificationToken(
					ctx.context.secret,
					email,
					undefined,
					ctx.context.options.emailVerification?.expiresIn,
				);
			} else {
				try {
					await sendVerificationEmailFn(ctx, user.user);
				} catch (e) {
					error = e;
				}
			}
			const remaining = MINIMUM_MS - (Date.now() - start);
			if (remaining > 0) {
				await new Promise((resolve) => setTimeout(resolve, remaining));
			}
			if (error) throw error;
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
				const params = new URLSearchParams({ error: error.code });
				const redirectURL = appendQueryParams(ctx.query.callbackURL, params);

				throw ctx.redirect(redirectURL);
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
			userId: z.string().optional(),
		});
		const parsed = schema.parse(jwt.payload);
		if (parsed.updateTo) {
			// A released address must not transfer links to its next owner.
			if (!parsed.userId) {
				return redirectOnError(BASE_ERROR_CODES.INVALID_TOKEN);
			}
			const boundUser = await ctx.context.internalAdapter.findUserById(
				parsed.userId,
			);
			if (!boundUser) {
				return redirectOnError(BASE_ERROR_CODES.USER_NOT_FOUND);
			}
			if (boundUser.email.toLowerCase() !== parsed.email) {
				return redirectOnError(BASE_ERROR_CODES.INVALID_TOKEN);
			}
			const session = await getSessionFromCtx(ctx);
			if (session && session.user.id !== boundUser.id) {
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
						{
							requestType: "change-email-verification",
							userId: boundUser.id,
						},
					);
					const updateCallbackURL = ctx.query.callbackURL
						? encodeURIComponent(ctx.query.callbackURL)
						: encodeURIComponent("/");
					const url = `${ctx.context.baseURL}/verify-email?token=${newToken}&callbackURL=${updateCallbackURL}`;
					if (ctx.context.options.emailVerification?.sendVerificationEmail) {
						await ctx.context.runInBackgroundOrAwait(
							ctx.context.options.emailVerification.sendVerificationEmail(
								{
									user: {
										...boundUser,
										email: parsed.updateTo,
									},
									url,
									token: newToken,
								},
								safeCloneRequest(ctx.request),
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
					// A requester who never proved the current address does not get
					// a verified address from the change.
					const emailVerified = boundUser.emailVerified;
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						boundUser.id,
						{
							email: parsed.updateTo,
							emailVerified,
						},
					);
					if (
						emailVerified &&
						ctx.context.options.emailVerification?.afterEmailVerification
					) {
						await ctx.context.options.emailVerification.afterEmailVerification(
							updatedUser,
							ctx.request,
						);
					}
					// The link proves the new inbox, not the account: only refresh an
					// existing session, never start one.
					if (session) {
						await setSessionCookie(ctx, {
							session: session.session,
							user: {
								...session.user,
								email: parsed.updateTo,
								emailVerified,
							},
						});
					}
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
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						boundUser.id,
						{
							email: parsed.updateTo,
							emailVerified: false,
						},
					);
					const newToken = await createEmailVerificationToken(
						ctx.context.secret,
						parsed.updateTo,
						undefined,
						undefined,
						{ userId: boundUser.id },
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
								safeCloneRequest(ctx.request),
							),
						);
					}
					if (session) {
						await setSessionCookie(ctx, {
							session: session.session,
							user: {
								...session.user,
								email: parsed.updateTo,
								emailVerified: false,
							},
						});
					}
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
		const user = await ctx.context.internalAdapter.findUserByEmail(
			parsed.email,
		);
		if (!user) {
			return redirectOnError(BASE_ERROR_CODES.USER_NOT_FOUND);
		}
		// A link issued to an earlier owner of this address must not verify the
		// current one. Links without a user id predate the binding.
		if (parsed.userId && parsed.userId !== user.user.id) {
			return redirectOnError(BASE_ERROR_CODES.INVALID_TOKEN);
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
