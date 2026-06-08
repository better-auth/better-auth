import type { BetterAuthPlugin } from "@better-auth/core";
import { amrForProvider } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as z from "zod";
import { APIError } from "../../api";
import { resolveSignIn } from "../../auth/resolve-sign-in";
import { parseUserOutput } from "../../db/schema";
import { OAUTH_CALLBACK_ERROR_CODES } from "../../oauth2/errors";
import { signInWithOAuthIdentity } from "../../oauth2/sign-in-with-oauth-identity";
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
					let payload: any;
					try {
						const JWKS = createRemoteJWKSet(
							new URL("https://www.googleapis.com/oauth2/v3/certs"),
						);
						const googleProvider =
							typeof ctx.context.options.socialProviders?.google === "function"
								? await ctx.context.options.socialProviders?.google()
								: ctx.context.options.socialProviders?.google;
						const { payload: verifiedPayload } = await jwtVerify(
							idToken,
							JWKS,
							{
								issuer: ["https://accounts.google.com", "accounts.google.com"],
								audience: options?.clientId || googleProvider?.clientId,
							},
						);
						payload = verifiedPayload;
					} catch {
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
					// token's email. One Tap is a fixed-grant credential flow, so the
					// recorded grant is the ID token's openid/profile/email.
					const data = await signInWithOAuthIdentity(ctx, {
						userInfo: {
							id: sub,
							email,
							emailVerified,
							name: name ?? "",
							image: picture,
						},
						providerId: "google",
						accountId: sub,
						tokens: { idToken, scopes: ["openid", "profile", "email"] },
						disableSignUp: options?.disableSignup,
						sourceProfile: payload as Record<string, unknown>,
					});
					if (data.error) {
						if (
							data.error === OAUTH_CALLBACK_ERROR_CODES.EMAIL_NOT_VERIFIED
						) {
							throw APIError.from(
								"FORBIDDEN",
								BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
							);
						}
						throw new APIError("UNAUTHORIZED", {
							message: data.error,
						});
					}

					const result = await resolveSignIn(ctx, {
						user: data.data!.user,
						amr: amrForProvider("google"),
					});
					if (result.kind === "challenge") {
						return ctx.json(result);
					}
					return ctx.json({
						token: result.session.token,
						user: parseUserOutput(ctx.context.options, result.user),
					});
				},
			),
		},
		options,
	}) satisfies BetterAuthPlugin;
