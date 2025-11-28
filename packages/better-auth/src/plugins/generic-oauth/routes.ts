import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-call";
import { decodeJwt } from "jose";
import * as z from "zod";
import { sessionMiddleware } from "../../api";
import { setSessionCookie } from "../../cookies";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { generateState, parseState } from "../../oauth2/state";
import type { User } from "../../types";
import { HIDE_METADATA } from "../../utils";
import { GENERIC_OAUTH_ERROR_CODES } from "./error-codes";
import type { GenericOAuthOptions } from "./types";

const signInWithOAuth2BodySchema = z.object({
	providerId: z.string().meta({
		description: "The provider ID for the OAuth provider",
	}),
	callbackURL: z
		.string()
		.meta({
			description: "The URL to redirect to after sign in",
		})
		.optional(),
	errorCallbackURL: z
		.string()
		.meta({
			description: "The URL to redirect to if an error occurs",
		})
		.optional(),
	newUserCallbackURL: z
		.string()
		.meta({
			description:
				'The URL to redirect to after login if the user is new. Eg: "/welcome"',
		})
		.optional(),
	disableRedirect: z
		.boolean()
		.meta({
			description: "Disable redirect",
		})
		.optional(),
	scopes: z
		.array(z.string())
		.meta({
			description: "Scopes to be passed to the provider authorization request.",
		})
		.optional(),
	requestSignUp: z
		.boolean()
		.meta({
			description:
				"Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider. Eg: false",
		})
		.optional(),
	/**
	 * Any additional data to pass through the oauth flow.
	 */
	additionalData: z.record(z.string(), z.any()).optional(),
});

/**
 * ### Endpoint
 *
 * POST `/sign-in/oauth2`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.signInWithOAuth2`
 *
 * **client:**
 * `authClient.signIn.oauth2`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/sign-in#api-method-sign-in-oauth2)
 */
export const signInWithOAuth2 = (options: GenericOAuthOptions) =>
	createAuthEndpoint(
		"/sign-in/oauth2",
		{
			method: "POST",
			body: signInWithOAuth2BodySchema,
			metadata: {
				openapi: {
					description: "Sign in with OAuth2",
					responses: {
						200: {
							description: "Sign in with OAuth2",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											url: {
												type: "string",
											},
											redirect: {
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
		async (ctx: GenericEndpointContext) => {
			const { providerId } = ctx.body;
			const config = options.config.find((c) => c.providerId === providerId);
			if (!config) {
				throw new APIError("BAD_REQUEST", {
					message: `${GENERIC_OAUTH_ERROR_CODES.PROVIDER_CONFIG_NOT_FOUND} ${providerId}`,
				});
			}
			const {
				discoveryUrl,
				authorizationUrl,
				tokenUrl,
				clientId,
				clientSecret,
				scopes,
				redirectURI,
				responseType,
				pkce,
				prompt,
				accessType,
				authorizationUrlParams,
				responseMode,
				authentication,
			} = config;
			let finalAuthUrl = authorizationUrl;
			let finalTokenUrl = tokenUrl;
			if (discoveryUrl) {
				const discovery = await betterFetch<{
					authorization_endpoint: string;
					token_endpoint: string;
				}>(discoveryUrl, {
					method: "GET",
					headers: config.discoveryHeaders,
					onError(context) {
						ctx.context.logger.error(context.error.message, context.error, {
							discoveryUrl,
						});
					},
				});
				if (discovery.data) {
					finalAuthUrl = discovery.data.authorization_endpoint;
					finalTokenUrl = discovery.data.token_endpoint;
				}
			}
			if (!finalAuthUrl || !finalTokenUrl) {
				throw new APIError("BAD_REQUEST", {
					message: GENERIC_OAUTH_ERROR_CODES.INVALID_OAUTH_CONFIGURATION,
				});
			}
			if (authorizationUrlParams) {
				const withAdditionalParams = new URL(finalAuthUrl);
				for (const [paramName, paramValue] of Object.entries(
					authorizationUrlParams,
				)) {
					withAdditionalParams.searchParams.set(paramName, paramValue);
				}
				finalAuthUrl = withAdditionalParams.toString();
			}
			const additionalParams =
				typeof authorizationUrlParams === "function"
					? authorizationUrlParams(ctx)
					: authorizationUrlParams;

			const { state, codeVerifier } = await generateState(
				ctx,
				undefined,
				ctx.body.additionalData,
			);
			const authUrl = await createAuthorizationURL({
				id: providerId,
				options: {
					clientId,
					clientSecret,
					redirectURI,
				},
				authorizationEndpoint: finalAuthUrl,
				state,
				codeVerifier: pkce ? codeVerifier : undefined,
				scopes: ctx.body.scopes
					? [...ctx.body.scopes, ...(scopes || [])]
					: scopes || [],
				redirectURI: `${ctx.context.baseURL}/oauth2/callback/${providerId}`,
				prompt,
				accessType,
				responseType,
				responseMode,
				additionalParams,
			});
			return ctx.json({
				url: authUrl.toString(),
				redirect: !ctx.body.disableRedirect,
			});
		},
	);

const OAuth2CallbackQuerySchema = z.object({
	code: z
		.string()
		.meta({
			description: "The OAuth2 code",
		})
		.optional(),
	error: z
		.string()
		.meta({
			description: "The error message, if any",
		})
		.optional(),
	error_description: z
		.string()
		.meta({
			description: "The error description, if any",
		})
		.optional(),
	state: z
		.string()
		.meta({
			description: "The state parameter from the OAuth2 request",
		})
		.optional(),
});

export const oAuth2Callback = (options: GenericOAuthOptions) =>
	createAuthEndpoint(
		"/oauth2/callback/:providerId",
		{
			method: "GET",
			query: OAuth2CallbackQuerySchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
				openapi: {
					description: "OAuth2 callback",
					responses: {
						200: {
							description: "OAuth2 callback",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											url: {
												type: "string",
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
		async (ctx: GenericEndpointContext) => {
			const defaultErrorURL =
				ctx.context.options.onAPIError?.errorURL ||
				`${ctx.context.baseURL}/error`;
			if (ctx.query.error || !ctx.query.code) {
				throw ctx.redirect(
					`${defaultErrorURL}?error=${
						ctx.query.error || "oAuth_code_missing"
					}&error_description=${ctx.query.error_description}`,
				);
			}
			const providerId = ctx.params?.providerId;
			if (!providerId) {
				throw new APIError("BAD_REQUEST", {
					message: GENERIC_OAUTH_ERROR_CODES.PROVIDER_ID_REQUIRED,
				});
			}
			const providerConfig = options.config.find(
				(p) => p.providerId === providerId,
			);

			if (!providerConfig) {
				throw new APIError("BAD_REQUEST", {
					message: `${GENERIC_OAUTH_ERROR_CODES.PROVIDER_CONFIG_NOT_FOUND} ${providerId}`,
				});
			}

			let tokens: OAuth2Tokens | undefined = undefined;
			const parsedState = await parseState(ctx);
			const {
				callbackURL,
				codeVerifier,
				errorURL,
				requestSignUp,
				newUserURL,
				link,
			} = parsedState;
			const code = ctx.query.code;

			function redirectOnError(error: string) {
				const defaultErrorURL =
					ctx.context.options.onAPIError?.errorURL ||
					`${ctx.context.baseURL}/error`;
				let url = errorURL || defaultErrorURL;
				if (url.includes("?")) {
					url = `${url}&error=${error}`;
				} else {
					url = `${url}?error=${error}`;
				}
				throw ctx.redirect(url);
			}

			let finalTokenUrl = providerConfig.tokenUrl;
			let finalUserInfoUrl = providerConfig.userInfoUrl;
			if (providerConfig.discoveryUrl) {
				const discovery = await betterFetch<{
					token_endpoint: string;
					userinfo_endpoint: string;
				}>(providerConfig.discoveryUrl, {
					method: "GET",
					headers: providerConfig.discoveryHeaders,
				});
				if (discovery.data) {
					finalTokenUrl = discovery.data.token_endpoint;
					finalUserInfoUrl = discovery.data.userinfo_endpoint;
				}
			}
			try {
				// Use custom getToken if provided
				if (providerConfig.getToken) {
					tokens = await providerConfig.getToken({
						code,
						redirectURI: `${ctx.context.baseURL}/oauth2/callback/${providerConfig.providerId}`,
						codeVerifier: providerConfig.pkce ? codeVerifier : undefined,
					});
				} else {
					// Standard token exchange with tokenUrlParams support
					if (!finalTokenUrl) {
						throw new APIError("BAD_REQUEST", {
							message: GENERIC_OAUTH_ERROR_CODES.INVALID_OAUTH_CONFIG,
						});
					}
					const additionalParams =
						typeof providerConfig.tokenUrlParams === "function"
							? providerConfig.tokenUrlParams(ctx)
							: providerConfig.tokenUrlParams;
					tokens = await validateAuthorizationCode({
						headers: providerConfig.authorizationHeaders,
						code,
						codeVerifier: providerConfig.pkce ? codeVerifier : undefined,
						redirectURI: `${ctx.context.baseURL}/oauth2/callback/${providerConfig.providerId}`,
						options: {
							clientId: providerConfig.clientId,
							clientSecret: providerConfig.clientSecret,
							redirectURI: providerConfig.redirectURI,
						},
						tokenEndpoint: finalTokenUrl,
						authentication: providerConfig.authentication,
						additionalParams,
					});
				}
			} catch (e) {
				ctx.context.logger.error(
					e && typeof e === "object" && "name" in e ? (e.name as string) : "",
					e,
				);
				throw redirectOnError("oauth_code_verification_failed");
			}
			if (!tokens) {
				throw new APIError("BAD_REQUEST", {
					message: GENERIC_OAUTH_ERROR_CODES.INVALID_OAUTH_CONFIG,
				});
			}
			const userInfo: Omit<User, "createdAt" | "updatedAt"> =
				await (async function handleUserInfo() {
					const userInfo = (
						providerConfig.getUserInfo
							? await providerConfig.getUserInfo(tokens)
							: await getUserInfo(tokens, finalUserInfoUrl)
					) as OAuth2UserInfo | null;
					if (!userInfo) {
						throw redirectOnError("user_info_is_missing");
					}
					const mapUser = providerConfig.mapProfileToUser
						? await providerConfig.mapProfileToUser(userInfo)
						: userInfo;
					const email = mapUser.email
						? mapUser.email.toLowerCase()
						: userInfo.email?.toLowerCase();
					if (!email) {
						ctx.context.logger.error("Unable to get user info", userInfo);
						throw redirectOnError("email_is_missing");
					}
					const id = mapUser.id ? String(mapUser.id) : String(userInfo.id);
					const name = mapUser.name ? mapUser.name : userInfo.name;
					if (!name) {
						ctx.context.logger.error("Unable to get user info", userInfo);
						throw redirectOnError("name_is_missing");
					}
					return {
						...userInfo,
						...mapUser,
						email,
						id,
						name,
					};
				})();
			if (link) {
				if (
					ctx.context.options.account?.accountLinking?.allowDifferentEmails !==
						true &&
					link.email !== userInfo.email
				) {
					return redirectOnError("email_doesn't_match");
				}
				const existingAccount =
					await ctx.context.internalAdapter.findAccountByProviderId(
						String(userInfo.id),
						providerConfig.providerId,
					);
				if (existingAccount) {
					if (existingAccount.userId !== link.userId) {
						return redirectOnError("account_already_linked_to_different_user");
					}
					const updateData = Object.fromEntries(
						Object.entries({
							accessToken: tokens.accessToken,
							idToken: tokens.idToken,
							refreshToken: tokens.refreshToken,
							accessTokenExpiresAt: tokens.accessTokenExpiresAt,
							refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
							scope: tokens.scopes?.join(","),
						}).filter(([_, value]) => value !== undefined),
					);
					await ctx.context.internalAdapter.updateAccount(
						existingAccount.id,
						updateData,
					);
				} else {
					const newAccount = await ctx.context.internalAdapter.createAccount({
						userId: link.userId,
						providerId: providerConfig.providerId,
						accountId: userInfo.id,
						accessToken: tokens.accessToken,
						accessTokenExpiresAt: tokens.accessTokenExpiresAt,
						refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
						scope: tokens.scopes?.join(","),
						refreshToken: tokens.refreshToken,
						idToken: tokens.idToken,
					});
					if (!newAccount) {
						return redirectOnError("unable_to_link_account");
					}
				}
				let toRedirectTo: string;
				try {
					const url = callbackURL;
					toRedirectTo = url.toString();
				} catch {
					toRedirectTo = callbackURL;
				}
				throw ctx.redirect(toRedirectTo);
			}

			const result = await handleOAuthUserInfo(ctx, {
				userInfo,
				account: {
					providerId: providerConfig.providerId,
					accountId: userInfo.id,
					...tokens,
					scope: tokens.scopes?.join(","),
				},
				callbackURL: callbackURL,
				disableSignUp:
					(providerConfig.disableImplicitSignUp && !requestSignUp) ||
					providerConfig.disableSignUp,
				overrideUserInfo: providerConfig.overrideUserInfo,
			});

			if (result.error) {
				return redirectOnError(result.error.split(" ").join("_"));
			}
			const { session, user } = result.data!;
			await setSessionCookie(ctx, {
				session,
				user,
			});
			let toRedirectTo: string;
			try {
				const url = result.isRegister ? newUserURL || callbackURL : callbackURL;
				toRedirectTo = url.toString();
			} catch {
				toRedirectTo = result.isRegister
					? newUserURL || callbackURL
					: callbackURL;
			}
			throw ctx.redirect(toRedirectTo);
		},
	);

const OAuth2LinkAccountBodySchema = z.object({
	providerId: z.string(),
	/**
	 * Callback URL to redirect to after the user has signed in.
	 */
	callbackURL: z.string(),
	/**
	 * Additional scopes to request when linking the account.
	 * This is useful for requesting additional permissions when
	 * linking a social account compared to the initial authentication.
	 */
	scopes: z
		.array(z.string())
		.meta({
			description: "Additional scopes to request when linking the account",
		})
		.optional(),
	/**
	 * The URL to redirect to if there is an error during the link process.
	 */
	errorCallbackURL: z
		.string()
		.meta({
			description:
				"The URL to redirect to if there is an error during the link process",
		})
		.optional(),
});
/**
 * ### Endpoint
 *
 * POST `/oauth2/link`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.oAuth2LinkAccount`
 *
 * **client:**
 * `authClient.oauth2.link`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/generic-oauth#api-method-oauth2-link)
 */
export const oAuth2LinkAccount = (options: GenericOAuthOptions) =>
	createAuthEndpoint(
		"/oauth2/link",
		{
			method: "POST",
			body: OAuth2LinkAccountBodySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Link an OAuth2 account to the current user session",
					responses: {
						"200": {
							description:
								"Authorization URL generated successfully for linking an OAuth2 account",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											url: {
												type: "string",
												format: "uri",
												description:
													"The authorization URL to redirect the user to for linking the OAuth2 account",
											},
											redirect: {
												type: "boolean",
												description:
													"Indicates that the client should redirect to the provided URL",
												enum: [true],
											},
										},
										required: ["url", "redirect"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (c: GenericEndpointContext) => {
			const session = c.context.session;
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: GENERIC_OAUTH_ERROR_CODES.SESSION_REQUIRED,
				});
			}
			const provider = options.config.find(
				(p) => p.providerId === c.body.providerId,
			);
			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: BASE_ERROR_CODES.PROVIDER_NOT_FOUND,
				});
			}
			const {
				providerId,
				clientId,
				clientSecret,
				redirectURI,
				authorizationUrl,
				discoveryUrl,
				pkce,
				scopes,
				prompt,
				accessType,
				authorizationUrlParams,
			} = provider;

			let finalAuthUrl = authorizationUrl;
			if (!finalAuthUrl) {
				if (!discoveryUrl) {
					throw new APIError("BAD_REQUEST", {
						message: GENERIC_OAUTH_ERROR_CODES.INVALID_OAUTH_CONFIGURATION,
					});
				}
				const discovery = await betterFetch<{
					authorization_endpoint: string;
					token_endpoint: string;
				}>(discoveryUrl, {
					method: "GET",
					headers: provider.discoveryHeaders,
					onError(context) {
						c.context.logger.error(context.error.message, context.error, {
							discoveryUrl,
						});
					},
				});
				if (discovery.data) {
					finalAuthUrl = discovery.data.authorization_endpoint;
				}
			}

			if (!finalAuthUrl) {
				throw new APIError("BAD_REQUEST", {
					message: GENERIC_OAUTH_ERROR_CODES.INVALID_OAUTH_CONFIGURATION,
				});
			}

			const state = await generateState(
				c,
				{
					userId: session.user.id,
					email: session.user.email,
				},
				undefined,
			);

			const additionalParams =
				typeof authorizationUrlParams === "function"
					? authorizationUrlParams(c)
					: authorizationUrlParams;

			const url = await createAuthorizationURL({
				id: providerId,
				options: {
					clientId,
					clientSecret,
					redirectURI:
						redirectURI || `${c.context.baseURL}/oauth2/callback/${providerId}`,
				},
				authorizationEndpoint: finalAuthUrl,
				state: state.state,
				codeVerifier: pkce ? state.codeVerifier : undefined,
				scopes: c.body.scopes || scopes || [],
				redirectURI:
					redirectURI || `${c.context.baseURL}/oauth2/callback/${providerId}`,
				prompt,
				accessType,
				additionalParams,
			});

			return c.json({
				url: url.toString(),
				redirect: true,
			});
		},
	);

export async function getUserInfo(
	tokens: OAuth2Tokens,
	finalUserInfoUrl: string | undefined,
): Promise<OAuth2UserInfo | null> {
	if (tokens.idToken) {
		const decoded = decodeJwt(tokens.idToken) as {
			sub: string;
			email_verified: boolean;
			email: string;
			name: string;
			picture: string;
		};
		if (decoded) {
			if (decoded.sub && decoded.email) {
				return {
					id: decoded.sub,
					emailVerified: decoded.email_verified,
					image: decoded.picture,
					...decoded,
				};
			}
		}
	}

	if (!finalUserInfoUrl) {
		return null;
	}

	const userInfo = await betterFetch<{
		email: string;
		sub?: string | undefined;
		name: string;
		email_verified: boolean;
		picture: string;
	}>(finalUserInfoUrl, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${tokens.accessToken}`,
		},
	});
	return {
		id: userInfo.data?.sub ?? "",
		emailVerified: userInfo.data?.email_verified ?? false,
		email: userInfo.data?.email,
		image: userInfo.data?.picture,
		name: userInfo.data?.name,
		...userInfo.data,
	};
}
