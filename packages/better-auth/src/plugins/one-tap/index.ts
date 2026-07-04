import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import {
	isGoogleHostedDomainAllowed,
	verifyGoogleIdToken,
} from "@better-auth/core/social-providers";
import * as z from "zod";
import { APIError } from "../../api";
import { setSessionCookie } from "../../cookies";
import { parseUserOutput } from "../../db/schema";
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

const oneTapCallbackBodySchema = z.object({
	idToken: z.string().meta({
		description:
			"Google ID token, which the client obtains from the One Tap API",
	}),
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
					const { idToken } = ctx.body;
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
					})) as Partial<GoogleProfile> | null;
					if (!payload) {
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
					if (!rawEmail) {
						return ctx.json({ error: "Email not available in token" });
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
							name: name ?? "",
							image: picture,
						},
						account: {
							providerId: "google",
							accountId: sub,
							idToken,
							scope: "openid,profile,email",
						},
						disableSignUp: options?.disableSignup,
					});
					if (result.error) {
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
