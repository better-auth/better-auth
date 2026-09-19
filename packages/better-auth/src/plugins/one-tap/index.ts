import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import {
	isGoogleHostedDomainAllowed,
	verifyGoogleIdToken,
} from "@better-auth/core/social-providers";
import * as z from "zod";
import { APIError } from "../../api";
import { expireCookie, setSessionCookie } from "../../cookies";
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

const ONE_TAP_NONCE_COOKIE = "one_tap_nonce";
const ONE_TAP_NONCE_TTL_SECONDS = 10 * 60;

const oneTapNonceIdentifier = (state: string) => `one-tap-nonce:${state}`;

const createOneTapNonceCookie = (ctx: GenericEndpointContext) =>
	ctx.context.createAuthCookie(ONE_TAP_NONCE_COOKIE, {
		maxAge: ONE_TAP_NONCE_TTL_SECONDS,
	});

/**
 * Creates the nonce passed to Google and binds it to the browser that initiated
 * the attempt. The browser only receives the nonce; the opaque state stays in
 * a signed HttpOnly cookie and identifies a short-lived, single-use record.
 */
async function createOneTapNonce(ctx: GenericEndpointContext) {
	const state = generateRandomString(32);
	const nonce = generateRandomString(32);
	const expiresAt = new Date(Date.now() + ONE_TAP_NONCE_TTL_SECONDS * 1000);
	const verification =
		await ctx.context.internalAdapter.createVerificationValue({
			identifier: oneTapNonceIdentifier(state),
			value: nonce,
			expiresAt,
		});

	if (!verification) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Unable to create One Tap nonce",
		});
	}

	const nonceCookie = createOneTapNonceCookie(ctx);
	await ctx.setSignedCookie(
		nonceCookie.name,
		state,
		ctx.context.secret,
		nonceCookie.attributes,
	);

	return nonce;
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
			oneTapNonce: createAuthEndpoint(
				"/one-tap/nonce",
				{
					method: "POST",
					metadata: {
						openapi: {
							summary: "Create a One Tap nonce",
							description:
								"Creates a short-lived nonce for a Google One Tap sign-in attempt",
							responses: {
								200: {
									description: "One Tap nonce created",
								},
							},
						},
					},
				},
				async (ctx) => {
					const nonce = await createOneTapNonce(ctx);
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
									description: "Invalid token or nonce",
								},
							},
						},
					},
				},
				async (ctx) => {
					const { idToken } = ctx.body;
					const nonceCookie = createOneTapNonceCookie(ctx);
					const state = await ctx.getSignedCookie(
						nonceCookie.name,
						ctx.context.secret,
					);
					if (!state) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid or expired One Tap nonce",
						});
					}
					const nonceVerification =
						await ctx.context.internalAdapter.findVerificationValue(
							oneTapNonceIdentifier(state),
						);
					const nonceExpiresAt = nonceVerification
						? new Date(nonceVerification.expiresAt).getTime()
						: 0;
					if (
						!nonceVerification ||
						!Number.isFinite(nonceExpiresAt) ||
						nonceExpiresAt <= Date.now()
					) {
						expireCookie(ctx, nonceCookie);
						throw new APIError("BAD_REQUEST", {
							message: "Invalid or expired One Tap nonce",
						});
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
						nonce: nonceVerification.value,
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
					const consumedNonce =
						await ctx.context.internalAdapter.consumeVerificationValue(
							oneTapNonceIdentifier(state),
						);
					if (
						!consumedNonce ||
						consumedNonce.value !== nonceVerification.value
					) {
						expireCookie(ctx, nonceCookie);
						throw new APIError("BAD_REQUEST", {
							message: "Invalid or expired One Tap nonce",
						});
					}
					expireCookie(ctx, nonceCookie);
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
