import * as z from "zod";
import { APIError } from "../../api";
import { createAuthEndpoint } from "@better-auth/core/api";
import { setSessionCookie } from "../../cookies";
import type { BetterAuthPlugin } from "@better-auth/core";
import { jwtVerify, createRemoteJWKSet, SignJWT } from "jose";
import { toBoolean } from "../../utils/boolean";

interface OneTapOptions {
	/**
	 * Disable the signup flow
	 *
	 * @default false
	 */
	disableSignup?: boolean;
	/**
	 * Google Client ID
	 *
	 * If a client ID is provided in the social provider configuration,
	 * it will be used.
	 */
	clientId?: string;
	/**
	 * Enable FedCM (Federated Credential Management) support
	 *
	 * When enabled, additional endpoints will be created to support
	 * the browser's native FedCM API alongside traditional One Tap.
	 *
	 * @default false
	 */
	enableFedCM?: boolean;
	/**
	 * FedCM configuration options
	 * Only used when enableFedCM is true
	 */
	fedcm?: {
		/**
		 * Privacy policy URL
		 * Required for FedCM in production
		 */
		privacyPolicyUrl?: string;
		/**
		 * Terms of service URL
		 * Required for FedCM in production
		 */
		termsOfServiceUrl?: string;
		/**
		 * Branding configuration for the FedCM dialog
		 */
		branding?: {
			/**
			 * Background color (hex)
			 * @default "#1a73e8"
			 */
			backgroundColor?: string;
			/**
			 * Text color (hex)
			 * @default "#ffffff"
			 */
			color?: string;
			/**
			 * Icon URL (must be HTTPS)
			 */
			iconUrl?: string;
		};
	};
}

/**
 * Generate a self-issued ID Token for FedCM assertion endpoint
 *
 * This function creates a JWT token that mimics Google's ID token format
 * but is signed with the application's secret instead of Google's keys.
 *
 * @param user - User information to include in the token
 * @param clientId - Google OAuth client ID
 * @param secret - Application secret for signing
 * @param issuer - Token issuer (usually the application's baseURL)
 * @param googleAccountId - Google account ID (sub) to maintain compatibility
 * @returns A signed JWT token string
 *
 * @internal
 */
async function generateFedCMIdToken(
	user: {
		id: string;
		email: string;
		name?: string | null;
		image?: string | null;
		emailVerified: boolean;
	},
	clientId: string,
	secret: string,
	issuer: string,
	googleAccountId: string,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);

	const payload = {
		iss: issuer,
		sub: googleAccountId, // Use Google account ID for compatibility
		aud: clientId,
		exp: now + 3600,
		iat: now,
		email: user.email,
		email_verified: user.emailVerified,
		name: user.name || user.email,
		picture: user.image || "",
	};

	const token = await new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(new TextEncoder().encode(secret));

	return token;
}

/**
 * Extract and validate session from cookie header
 *
 * Parses the cookie header, extracts the session token, and retrieves
 * the corresponding session from the database. Used by FedCM accounts endpoint.
 *
 * @param ctx - Endpoint context containing request headers
 * @returns Session object if found and valid, null otherwise
 *
 * @internal
 */
async function getSessionFromCookie(ctx: any) {
	try {
		const cookieHeader = ctx.request?.headers.get("cookie");
		if (!cookieHeader) return null;

		const sessionTokenName = ctx.context.authCookies.sessionToken.name;
		const cookies = cookieHeader.split(";").reduce(
			(acc: Record<string, string>, cookie: string) => {
				const [key, value] = cookie.trim().split("=");
				if (key && value) acc[key] = value;
				return acc;
			},
			{} as Record<string, string>,
		);

		const sessionToken = cookies[sessionTokenName];
		if (!sessionToken) return null;

		const session = await ctx.context.internalAdapter.findSession(sessionToken);
		if (!session || !session.userId) return null;

		return session;
	} catch {
		return null;
	}
}

/**
 * Create CORS headers for FedCM endpoints according to spec
 *
 * FedCM requires specific CORS headers for different endpoints:
 * - Well-known and config: Allow all origins (*)
 * - Accounts and assertion: Allow specific origin with credentials
 *
 * @param origin - Request origin (null for wildcard)
 * @param allowCredentials - Whether to allow credentials
 * @returns Object containing CORS headers
 *
 * @internal
 */
function createFedCMHeaders(
	origin?: string | null,
	allowCredentials = true,
): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (origin) {
		headers["Access-Control-Allow-Origin"] = origin;
	} else {
		headers["Access-Control-Allow-Origin"] = "*";
	}

	if (allowCredentials) {
		headers["Access-Control-Allow-Credentials"] = "true";
	}

	return headers;
}

/**
 * Google One Tap Plugin
 *
 * Provides Google One Tap authentication with optional FedCM support.
 *
 * **Features:**
 * - Traditional Google One Tap (iframe-based)
 * - Modern FedCM support (browser-native, no third-party cookies)
 * - Automatic fallback between modes
 * - Account linking support
 * - Customizable branding (FedCM mode)
 *
 * **Basic Usage:**
 * ```typescript
 * betterAuth({
 *   plugins: [oneTap()]
 * })
 * ```
 *
 * **With FedCM:**
 * ```typescript
 * betterAuth({
 *   plugins: [
 *     oneTap({
 *       enableFedCM: true,
 *       fedcm: {
 *         privacyPolicyUrl: "/privacy",
 *         termsOfServiceUrl: "/terms"
 *       }
 *     })
 *   ]
 * })
 * ```
 *
 * @param options - Plugin configuration options
 * @returns BetterAuthPlugin
 *
 * @see https://better-auth.com/docs/plugins/one-tap
 * @see https://developers.google.com/identity/gsi/web
 * @see https://w3c-fedid.github.io/FedCM/ (FedCM spec)
 */
export const oneTap = (options?: OneTapOptions) => {
	const coreEndpoints = {
		oneTapCallback: createAuthEndpoint(
			"/one-tap/callback",
			{
				method: "POST",
				body: z.object({
					idToken: z.string().meta({
						description:
							"Google ID token, which the client obtains from the One Tap API",
					}),
				}),
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
					const { payload: verifiedPayload } = await jwtVerify(idToken, JWKS, {
						issuer: ["https://accounts.google.com", "accounts.google.com"],
						audience:
							options?.clientId ||
							ctx.context.options.socialProviders?.google?.clientId,
					});
					payload = verifiedPayload;
				} catch (error) {
					if (options?.enableFedCM) {
						try {
							const { payload: selfIssuedPayload } = await jwtVerify(
								idToken,
								new TextEncoder().encode(ctx.context.secret),
								{
									issuer: ctx.context.baseURL,
									audience:
										options?.clientId ||
										ctx.context.options.socialProviders?.google?.clientId,
								},
							);
							payload = selfIssuedPayload;
						} catch (fedcmError) {
							throw new APIError("BAD_REQUEST", {
								message: "invalid id token",
							});
						}
					} else {
						throw new APIError("BAD_REQUEST", {
							message: "invalid id token",
						});
					}
				}
				const { email, email_verified, name, picture, sub } = payload;
				if (!email) {
					return ctx.json({ error: "Email not available in token" });
				}

				const user = await ctx.context.internalAdapter.findUserByEmail(email);
				if (!user) {
					if (options?.disableSignup) {
						throw new APIError("BAD_GATEWAY", {
							message: "User not found",
						});
					}
					const newUser = await ctx.context.internalAdapter.createOAuthUser(
						{
							email,
							emailVerified:
								typeof email_verified === "boolean"
									? email_verified
									: toBoolean(email_verified),
							name,
							image: picture,
						},
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
						user: {
							id: newUser.user.id,
							email: newUser.user.email,
							emailVerified: newUser.user.emailVerified,
							name: newUser.user.name,
							image: newUser.user.image,
							createdAt: newUser.user.createdAt,
							updatedAt: newUser.user.updatedAt,
						},
					});
				}
				const account = await ctx.context.internalAdapter.findAccount(sub);
				if (!account) {
					const accountLinking = ctx.context.options.account?.accountLinking;
					const shouldLinkAccount =
						accountLinking?.enabled &&
						(accountLinking.trustedProviders?.includes("google") ||
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
					user: {
						id: user.user.id,
						email: user.user.email,
						emailVerified: user.user.emailVerified,
						name: user.user.name,
						image: user.user.image,
						createdAt: user.user.createdAt,
						updatedAt: user.user.updatedAt,
					},
				});
			},
		),
	};

	const fedcmEndpoints = options?.enableFedCM
		? {
				// Well-Known Web Identity endpoint
				fedcmWebIdentity: createAuthEndpoint(
					"/.well-known/web-identity",
					{
						method: "GET",
						metadata: {
							isAction: false,
							client: false,
						},
					},
					async (ctx) => {
						const baseURL = ctx.context.baseURL;
						return new Response(
							JSON.stringify({
								provider_urls: [`${baseURL}/one-tap/fedcm/config`],
							}),
							{
								status: 200,
								headers: createFedCMHeaders(null, false),
							},
						);
					},
				),

				// FedCM Configuration endpoint
				fedcmConfig: createAuthEndpoint(
					"/one-tap/fedcm/config",
					{
						method: "GET",
						metadata: {
							isAction: false,
							client: false,
						},
					},
					async (ctx) => {
						const baseURL = ctx.context.baseURL;
						const config = {
							accounts_endpoint: `${baseURL}/one-tap/fedcm/accounts`,
							client_metadata_endpoint: `${baseURL}/one-tap/fedcm/client-metadata`,
							id_assertion_endpoint: `${baseURL}/one-tap/fedcm/assertion`,
							login_url: `${baseURL.replace("/api/auth", "")}/login`,
							branding: {
								background_color:
									options.fedcm?.branding?.backgroundColor || "#1a73e8",
								color: options.fedcm?.branding?.color || "#ffffff",
								...(options.fedcm?.branding?.iconUrl && {
									icons: [
										{
											url: options.fedcm.branding.iconUrl,
											size: 32,
										},
									],
								}),
							},
						};

						return new Response(JSON.stringify(config), {
							status: 200,
							headers: createFedCMHeaders(ctx.request?.headers.get("origin")),
						});
					},
				),

				// FedCM Accounts endpoint
				fedcmAccounts: createAuthEndpoint(
					"/one-tap/fedcm/accounts",
					{
						method: "GET",
						metadata: {
							isAction: false,
							client: false,
						},
					},
					async (ctx) => {
						const session = await getSessionFromCookie(ctx);
						if (!session) {
							return new Response(JSON.stringify({ accounts: [] }), {
								status: 200,
								headers: createFedCMHeaders(ctx.request?.headers.get("origin")),
							});
						}

						const userData = await ctx.context.internalAdapter.findUserById(
							session.userId,
						);
						if (!userData) {
							return new Response(JSON.stringify({ accounts: [] }), {
								status: 200,
								headers: createFedCMHeaders(ctx.request?.headers.get("origin")),
							});
						}

						const accounts = [
							{
								id: userData.id,
								email: userData.email,
								name: userData.name || userData.email,
								given_name:
									userData.name?.split(" ")[0] || userData.email.split("@")[0],
								picture: userData.image || "",
								approved_clients: [],
							},
						];

						return new Response(JSON.stringify({ accounts }), {
							status: 200,
							headers: createFedCMHeaders(ctx.request?.headers.get("origin")),
						});
					},
				),

				// FedCM Client Metadata endpoint
				fedcmClientMetadata: createAuthEndpoint(
					"/one-tap/fedcm/client-metadata",
					{
						method: "GET",
						query: z.object({
							client_id: z.string(),
						}),
						metadata: {
							isAction: false,
							client: false,
						},
					},
					async (ctx) => {
						const metadata = {
							privacy_policy_url: options.fedcm?.privacyPolicyUrl || "",
							terms_of_service_url: options.fedcm?.termsOfServiceUrl || "",
						};

						return new Response(JSON.stringify(metadata), {
							status: 200,
							headers: createFedCMHeaders(ctx.request?.headers.get("origin")),
						});
					},
				),

				// FedCM ID Assertion endpoint
				fedcmAssertion: createAuthEndpoint(
					"/one-tap/fedcm/assertion",
					{
						method: "POST",
						body: z.object({
							client_id: z.string(),
							account_id: z.string(),
							disclosure_text_shown: z.boolean().optional(),
							is_auto_selected: z.boolean().optional(),
						}),
						metadata: {
							isAction: false,
							client: false,
						},
					},
					async (ctx) => {
						const { client_id, account_id } = ctx.body;

						const currentSession = await getSessionFromCookie(ctx);
						if (!currentSession) {
							throw new APIError("UNAUTHORIZED", {
								message: "Not authenticated",
							});
						}

						if (currentSession.userId !== account_id) {
							throw new APIError("FORBIDDEN", {
								message: "Cannot generate token for another user",
							});
						}

						const expectedClientId =
							options?.clientId ||
							ctx.context.options.socialProviders?.google?.clientId;

						if (!expectedClientId) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Google client ID not configured",
							});
						}

						if (client_id !== expectedClientId) {
							throw new APIError("UNAUTHORIZED", {
								message: "Invalid client_id",
							});
						}

						const userData =
							await ctx.context.internalAdapter.findUserById(account_id);
						if (!userData) {
							throw new APIError("NOT_FOUND", {
								message: "User not found",
							});
						}

						const accounts =
							await ctx.context.internalAdapter.findAccounts(account_id);
						const googleAccount = accounts.find(
							(acc) => acc.providerId === "google",
						);

						if (!googleAccount) {
							throw new APIError("NOT_FOUND", {
								message: "Google account not linked to this user",
							});
						}

						const idToken = await generateFedCMIdToken(
							userData,
							client_id,
							ctx.context.secret,
							ctx.context.baseURL,
							googleAccount.accountId,
						);

						return new Response(JSON.stringify({ token: idToken }), {
							status: 200,
							headers: createFedCMHeaders(ctx.request?.headers.get("origin")),
						});
					},
				),
			}
		: {};

	return {
		id: "one-tap",
		endpoints: Object.assign({}, coreEndpoints, fedcmEndpoints) as any,
	} satisfies BetterAuthPlugin;
};
