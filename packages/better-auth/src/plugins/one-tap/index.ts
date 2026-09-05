import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import {
	isGoogleHostedDomainAllowed,
	verifyGoogleIdToken,
} from "@better-auth/core/social-providers";
import * as z from "zod";
import { APIError } from "../../api";
import { setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { parseUserOutput } from "../../db/schema";
import { OAUTH_CALLBACK_ERROR_CODES } from "../../oauth2/errors";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { toBoolean } from "../../utils/boolean";
import { PACKAGE_VERSION } from "../../version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"one-tap": {
			creator: typeof oneTap;
		};
	}
}

export interface OneTapOptions {
	/**
	 * Disable the signup flow
	 *
	 * @default false
	 */
	disableSignup?: boolean | undefined;
	/**
	 * Google Client ID
	 *
	 * If a client ID is provided in the social provider configuration,
	 * it will be used.
	 */
	clientId?: string | undefined;
}

const ONE_TAP_NONCE_IDENTIFIER_PREFIX = "one-tap-nonce:";
const ONE_TAP_NONCE_EXPIRES_IN_MS = 5 * 60 * 1000;

const oneTapNonceBodySchema = z.object({}).strict().optional();

const oneTapCallbackBodySchema = z.object({
	idToken: z.string().meta({
		description:
			"Google ID token, which the client obtains from the One Tap API",
	}),
	/**
	 * Nonce previously issued by `/one-tap/nonce`. It is consumed on use and
	 * must equal the ID token's `nonce` claim, which binds the token to this
	 * sign-in attempt and prevents a captured token from being replayed.
	 */
	nonce: z
		.string()
		.meta({
			description:
				"Nonce issued by /one-tap/nonce and passed to Google when the ID token was requested",
		})
		.optional(),
	/**
	 * Sent so the global origin-check middleware validates the post-login
	 * redirect target against `trustedOrigins`. Without it the client performs
	 * an unvalidated `window.location` redirect, which is an open redirect.
	 */
	callbackURL: z
		.string()
		.meta({
			description: "URL to redirect to after a successful sign-in",
		})
		.optional(),
});

export const oneTap = (options?: OneTapOptions | undefined) =>
	({
		id: "one-tap",
		version: PACKAGE_VERSION,
		endpoints: {
			oneTapNonce: createAuthEndpoint(
				"/one-tap/nonce",
				{
					method: "POST",
					body: oneTapNonceBodySchema,
					metadata: {
						openapi: {
							summary: "Issue a One Tap nonce",
							description:
								"Issues a single-use nonce to pass to Google when requesting the One Tap ID token. The callback consumes it and requires the token's nonce claim to match.",
							responses: {
								200: {
									description: "Successful response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													nonce: { type: "string" },
												},
												required: ["nonce"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const nonce = generateRandomString(32, "a-z", "A-Z", "0-9");
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `${ONE_TAP_NONCE_IDENTIFIER_PREFIX}${nonce}`,
						value: nonce,
						expiresAt: new Date(Date.now() + ONE_TAP_NONCE_EXPIRES_IN_MS),
					});
					return ctx.json({ nonce });
				},
			),
			oneTapCallback: createAuthEndpoint(
				"/one-tap/callback",
				{
					method: "POST",
					body: oneTapCallbackBodySchema,
					metadata: {
						openapi: {
							summary: "One tap callback",
							description:
								"Use this endpoint to authenticate with Google One Tap",
							responses: {
								200: {
									description: "Successful response",
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
								400: {
									description: "Invalid token",
								},
							},
						},
					},
				},
				async (ctx) => {
					const { idToken, nonce } = ctx.body;
					// Consume the nonce before any verification work so a failed
					// attempt burns it too and concurrent racers cannot share it.
					if (nonce !== undefined) {
						const issued =
							await ctx.context.internalAdapter.consumeVerificationValue(
								`${ONE_TAP_NONCE_IDENTIFIER_PREFIX}${nonce}`,
							);
						if (!issued) {
							throw new APIError("BAD_REQUEST", {
								message: "invalid or expired nonce",
							});
						}
					}
					const googleProvider =
						typeof ctx.context.options.socialProviders?.google === "function"
							? await ctx.context.options.socialProviders?.google()
							: ctx.context.options.socialProviders?.google;
					// Fail closed on a missing audience: without an expected client ID,
					// jose verifies Google's signature and issuer but not that the token
					// was minted for this relying party, so a token issued to a different
					// Google client would be accepted. Resolve and require it before
					// verification.
					const audience = options?.clientId || googleProvider?.clientId;
					if (!audience || (Array.isArray(audience) && audience.length === 0)) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Google client ID is required for One Tap. Set it on the oneTap plugin (clientId) or on socialProviders.google.",
						});
					}
					const payload = (await verifyGoogleIdToken({
						token: idToken,
						audience,
						nonce,
					})) as (Partial<GoogleProfile> & { nonce?: unknown }) | null;
					if (!payload) {
						throw new APIError("BAD_REQUEST", {
							message: "invalid id token",
						});
					}
					// A token minted with a nonce must be presented with that nonce.
					// Accepting it without one would let a captured token bypass the
					// single-use binding above.
					if (payload.nonce !== undefined && nonce === undefined) {
						throw new APIError("BAD_REQUEST", {
							message: "invalid id token",
						});
					}
					if (!payload.sub) {
						throw new APIError("BAD_REQUEST", {
							message: "invalid id token",
						});
					}
					// Apply the configured Google hosted domain (`hd`) so One Tap
					// matches the redirect sign-in flow, which rejects tokens whose
					// `hd` claim is missing or outside the configured restriction.
					const configuredHostedDomain = googleProvider?.hd;
					if (
						!isGoogleHostedDomainAllowed(configuredHostedDomain, payload.hd)
					) {
						ctx.context.logger.error(
							`Google One Tap sign-in rejected: id token hosted domain (hd) "${
								payload.hd ?? "<missing>"
							}" does not satisfy the configured "hd" option "${configuredHostedDomain}".`,
						);
						throw new APIError("BAD_REQUEST", {
							message: "invalid id token",
						});
					}
					const {
						email: rawEmail,
						email_verified,
						name,
						picture,
						sub,
					} = payload;
					if (typeof rawEmail !== "string" || !rawEmail) {
						throw new APIError("BAD_REQUEST", {
							message: "Email not available in token",
						});
					}
					if (typeof sub !== "string" || !sub) {
						throw new APIError("BAD_REQUEST", {
							message: "invalid id token",
						});
					}
					const email = rawEmail.toLowerCase();

					const emailVerified =
						typeof email_verified === "boolean"
							? email_verified
							: toBoolean(email_verified);

					// Resolve identity through the shared OAuth path so One Tap matches
					// the redirect and `signIn.social` flows: the account that owns the
					// Google `sub` wins, never whichever local user happens to share the
					// token's email.
					const result = await handleOAuthUserInfo(ctx, {
						userInfo: {
							id: sub,
							email,
							emailVerified,
							name: typeof name === "string" ? name : "",
							image: typeof picture === "string" ? picture : undefined,
						},
						account: {
							providerId: "google",
							issuer: "https://accounts.google.com",
							accountId: sub,
							idToken,
							scope: "openid,profile,email",
						},
						disableSignUp:
							options?.disableSignup || googleProvider?.disableSignUp,
						source: {
							method: "oauth",
							oauth: {
								providerId: "google",
								profile: payload as Record<string, unknown>,
							},
						},
					});
					if (result.error) {
						if (
							result.error === OAUTH_CALLBACK_ERROR_CODES.EMAIL_NOT_VERIFIED
						) {
							throw APIError.from(
								"FORBIDDEN",
								BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
							);
						}
						throw new APIError("UNAUTHORIZED", {
							message: result.error,
						});
					}

					await setSessionCookie(ctx, result.data!);
					return ctx.json({
						token: result.data!.session.token,
						user: parseUserOutput(ctx.context.options, result.data!.user),
					});
				},
			),
		},
		options,
	}) satisfies BetterAuthPlugin;
