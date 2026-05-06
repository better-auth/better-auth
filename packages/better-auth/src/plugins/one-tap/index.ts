import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type {
	GoogleOptions,
	GoogleProfile,
} from "@better-auth/core/social-providers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as z from "zod";
import { APIError } from "../../api";
import { setSessionCookie } from "../../cookies";
import { parseUserOutput } from "../../db/schema";
import type { User } from "../../types";
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
	/**
	 * Maps the verified Google ID token payload to user fields during sign-up.
	 *
	 * When set, this runs instead of `socialProviders.google.mapProfileToUser`.
	 * When omitted, the Google provider's `mapProfileToUser` (if any) is used so
	 * One Tap matches the redirect OAuth flow (`signIn.social({ provider: "google" })`).
	 */
	mapProfileToUser?: GoogleOptions["mapProfileToUser"];
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
					const googleProvider =
						typeof ctx.context.options.socialProviders?.google === "function"
							? await ctx.context.options.socialProviders?.google()
							: ctx.context.options.socialProviders?.google;

					let verifiedPayload: GoogleProfile;
					try {
						const JWKS = createRemoteJWKSet(
							new URL("https://www.googleapis.com/oauth2/v3/certs"),
						);
						const { payload } = await jwtVerify(idToken, JWKS, {
							issuer: ["https://accounts.google.com", "accounts.google.com"],
							audience: options?.clientId || googleProvider?.clientId,
						});
						verifiedPayload = payload as unknown as GoogleProfile;
					} catch {
						throw new APIError("BAD_REQUEST", {
							message: "invalid id token",
						});
					}
					const { email, email_verified, name, picture, sub } = verifiedPayload;
					if (!email || typeof email !== "string") {
						return ctx.json({ error: "Email not available in token" });
					}
					if (typeof sub !== "string" || sub.length === 0) {
						throw new APIError("BAD_REQUEST", {
							message: "invalid id token",
						});
					}

					const profile = verifiedPayload;
					const profileMapper =
						options?.mapProfileToUser ?? googleProvider?.mapProfileToUser;
					const mappedFields = profileMapper
						? await profileMapper(profile)
						: undefined;
					const { id: _discardProviderSubject, ...providerMappedRest } =
						mappedFields ?? {};

					const baseUser = {
						email,
						emailVerified:
							typeof email_verified === "boolean"
								? email_verified
								: toBoolean(email_verified),
						name: typeof name === "string" ? name : "",
						image: picture,
					};
					const combinedOAuthUser: Record<string, unknown> = {
						...baseUser,
						...providerMappedRest,
					};
					const mergedEmailRaw = combinedOAuthUser.email;
					const mergedNameRaw = combinedOAuthUser.name;
					const mergedEmailVerifiedRaw = combinedOAuthUser.emailVerified;
					const mergedImageRaw = combinedOAuthUser.image;
					const mergedAdditionalFields = { ...combinedOAuthUser };
					for (const key of [
						"id",
						"email",
						"name",
						"emailVerified",
						"image",
					] as const) {
						delete mergedAdditionalFields[key];
					}
					const normalizedEmail =
						typeof mergedEmailRaw === "string" && mergedEmailRaw
							? mergedEmailRaw
							: email;
					const normalizedName =
						mergedNameRaw != null && String(mergedNameRaw).trim() !== ""
							? String(mergedNameRaw)
							: baseUser.name;
					const normalizedEmailVerified =
						typeof mergedEmailVerifiedRaw === "boolean"
							? mergedEmailVerifiedRaw
							: baseUser.emailVerified;
					const normalizedImage =
						mergedImageRaw !== undefined ? mergedImageRaw : baseUser.image;

					const user = await ctx.context.internalAdapter.findUserByEmail(email);
					if (!user) {
						if (options?.disableSignup) {
							throw new APIError("BAD_GATEWAY", {
								message: "User not found",
							});
						}
						const newUser = await ctx.context.internalAdapter.createOAuthUser(
							{
								...mergedAdditionalFields,
								email: normalizedEmail,
								name: normalizedName,
								emailVerified: normalizedEmailVerified,
								image: normalizedImage,
							} as Omit<User, "id" | "createdAt" | "updatedAt">,
							{
								providerId: "google",
								accountId: sub,
							},
						);
						if (!newUser) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Could not create user",
							});
						}
						const session = await ctx.context.internalAdapter.createSession(
							newUser.user.id,
						);
						await setSessionCookie(ctx, {
							user: newUser.user,
							session,
						});
						return ctx.json({
							token: session.token,
							user: parseUserOutput(ctx.context.options, newUser.user),
						});
					}
					const account = await ctx.context.internalAdapter.findAccount(sub);
					if (!account) {
						const accountLinking = ctx.context.options.account?.accountLinking;
						const shouldLinkAccount =
							accountLinking?.enabled !== false &&
							(ctx.context.trustedProviders.includes("google") ||
								email_verified);
						if (shouldLinkAccount) {
							await ctx.context.internalAdapter.linkAccount({
								userId: user.user.id,
								providerId: "google",
								accountId: sub,
								scope: "openid,profile,email",
								idToken,
							});
						} else {
							throw new APIError("UNAUTHORIZED", {
								message: "Google sub doesn't match",
							});
						}
					}
					const session = await ctx.context.internalAdapter.createSession(
						user.user.id,
					);

					await setSessionCookie(ctx, {
						user: user.user,
						session,
					});
					return ctx.json({
						token: session.token,
						user: parseUserOutput(ctx.context.options, user.user),
					});
				},
			),
		},
		options,
	}) satisfies BetterAuthPlugin;
