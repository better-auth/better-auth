import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { Account, AccountWithIdentity } from "@better-auth/core/db";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import {
	additionalAuthorizationParamsSchema,
	supportsIdTokenSignIn,
	verifyProviderIdToken,
} from "@better-auth/core/oauth2";
import { SocialProviderListEnum } from "@better-auth/core/social-providers";

import * as z from "zod";
import { getAwaitableValue } from "../../context/helpers";
import {
	hasServerAccountStore,
	shouldBindAccountCookieToSessionUser,
} from "../../context/store-capabilities";
import {
	clearProviderAccountBindingCookie,
	expireCookie,
	setProviderAccountCookieForSession,
} from "../../cookies";
import type { ProviderAccountCookie } from "../../cookies/session-store";
import {
	createAccountStore,
	getAccountCookie,
	hasMatchingAuthenticatedProviderAccountBinding,
} from "../../cookies/session-store";
import { parseAccountOutput, parseIdentityOutput } from "../../db/schema";
import { missingEmailLogMessage } from "../../oauth2/errors";
import { resolveOAuthIdentityKeyForAPI } from "../../oauth2/identity-key";
import { applyUpdateUserInfoOnLink } from "../../oauth2/provider-user";
import { generateIdTokenNonce, generateState } from "../../oauth2/state";
import {
	decryptOAuthToken,
	getOAuthCallbackPath,
	setTokenUtil,
} from "../../oauth2/utils";
import { isAPIError } from "../../utils/is-api-error";
import {
	freshSessionMiddleware,
	getAuthoritativeSessionFromCtx,
	sensitiveSessionMiddleware,
	sessionMiddleware,
} from "./session";

function parseStoredScopes(scope: string | null | undefined): string[] {
	if (!scope) return [];
	return scope
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export const listUserAccounts = createAuthEndpoint(
	"/list-accounts",
	{
		method: "GET",
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				operationId: "listUserAccounts",
				description: "List all accounts linked to the user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: {
										type: "object",
										properties: {
											id: {
												type: "string",
											},
											providerId: {
												type: "string",
											},
											createdAt: {
												type: "string",
												format: "date-time",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
											},
											identity: {
												type: "object",
												properties: {
													id: { type: "string" },
													issuer: { type: "string" },
													providerAccountId: { type: "string" },
													createdAt: {
														type: "string",
														format: "date-time",
													},
													updatedAt: {
														type: "string",
														format: "date-time",
													},
												},
												required: [
													"id",
													"issuer",
													"providerAccountId",
													"createdAt",
													"updatedAt",
												],
											},
											scopes: {
												type: "array",
												items: {
													type: "string",
												},
											},
										},
										required: [
											"id",
											"providerId",
											"createdAt",
											"updatedAt",
											"identity",
											"scopes",
										],
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (c) => {
		const session = c.context.session;
		const accounts = await c.context.internalAdapter.listUserAccounts(
			session.user.id,
		);
		return c.json(
			accounts.map(({ account, identity }) => {
				const {
					scope,
					identityId: _identityId,
					...parsedAccount
				} = parseAccountOutput(c.context.options, account);
				const { userId: _userId, ...parsedIdentity } = parseIdentityOutput(
					c.context.options,
					identity,
				);
				return {
					...parsedAccount,
					identity: parsedIdentity,
					scopes: parseStoredScopes(scope),
				};
			}),
		);
	},
);

export const linkSocialAccount = createAuthEndpoint(
	"/link-social",
	{
		method: "POST",
		requireHeaders: true,
		body: z.object({
			/**
			 * Callback URL to redirect to after the user has signed in.
			 */
			callbackURL: z
				.string()
				.meta({
					description: "The URL to redirect to after the user has signed in",
				})
				.optional(),
			/**
			 * OAuth2 provider to use
			 */
			provider: SocialProviderListEnum,
			/**
			 * ID Token for direct authentication without redirect
			 */
			idToken: z
				.object({
					token: z.string(),
					nonce: z.string().optional(),
					accessToken: z.string().optional(),
					refreshToken: z.string().optional(),
				})
				.optional(),
			/**
			 * Whether to allow sign up for new users
			 */
			requestSignUp: z.boolean().optional(),
			/**
			 * Additional scopes to request when linking the account.
			 * This is useful for requesting additional permissions when
			 * linking a social account compared to the initial authentication.
			 */
			scopes: z
				.array(z.string())
				.meta({
					description: "Additional scopes to request from the provider",
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
			/**
			 * Disable automatic redirection to the provider
			 *
			 * This is useful if you want to handle the redirection
			 * yourself like in a popup or a different tab.
			 */
			disableRedirect: z
				.boolean()
				.meta({
					description:
						"Disable automatic redirection to the provider. Useful for handling the redirection yourself",
				})
				.optional(),
			/**
			 * The login hint to forward to the provider authorization endpoint.
			 */
			loginHint: z
				.string()
				.meta({
					description:
						"The login hint to use for the authorization code request",
				})
				.optional(),
			/**
			 * Extra query parameters to append to the provider authorization URL.
			 * Reserved OAuth keys (state, client_id, redirect_uri, response_type,
			 * code_challenge, code_challenge_method, nonce, scope) are rejected.
			 */
			additionalParams: additionalAuthorizationParamsSchema,
			/**
			 * Any additional data to pass through the oauth flow.
			 */
			additionalData: z.record(z.string(), z.any()).optional(),
		}),
		use: [sensitiveSessionMiddleware],
		metadata: {
			openapi: {
				description: "Link a social account to the user",
				operationId: "linkSocialAccount",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										url: {
											type: "string",
											description:
												"The authorization URL to redirect the user to",
										},
										redirect: {
											type: "boolean",
											description:
												"Indicates if the user should be redirected to the authorization URL",
										},
										status: {
											type: "boolean",
										},
									},
									required: ["redirect"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (c) => {
		const session = c.context.session;
		const provider = await getAwaitableValue(c.context.socialProviders, {
			value: c.body.provider,
		});

		if (!provider) {
			c.context.logger.error(
				"Provider not found. Make sure to add the provider in your auth config",
				{
					provider: c.body.provider,
				},
			);
			throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.PROVIDER_NOT_FOUND);
		}

		// Handle ID Token flow if provided
		if (c.body.idToken) {
			if (!supportsIdTokenSignIn(provider)) {
				c.context.logger.error(
					"Provider does not support id token verification",
					{
						provider: c.body.provider,
					},
				);
				throw APIError.from(
					"NOT_FOUND",
					BASE_ERROR_CODES.ID_TOKEN_NOT_SUPPORTED,
				);
			}

			const { token, nonce } = c.body.idToken;
			const valid = await verifyProviderIdToken(provider, token, nonce);
			if (!valid) {
				c.context.logger.warn("Invalid id token", {
					provider: c.body.provider,
				});
				throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_TOKEN);
			}

			const linkingUserInfo = await provider.getUserInfo({
				idToken: token,
				accessToken: c.body.idToken.accessToken,
				refreshToken: c.body.idToken.refreshToken,
			});

			if (!linkingUserInfo || !linkingUserInfo?.user) {
				c.context.logger.error("Failed to get user info", {
					provider: c.body.provider,
				});
				throw APIError.from(
					"UNAUTHORIZED",
					BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
				);
			}

			const identityKey = await resolveOAuthIdentityKeyForAPI(
				provider,
				{
					idToken: token,
					accessToken: c.body.idToken.accessToken,
					refreshToken: c.body.idToken.refreshToken,
				},
				linkingUserInfo.data,
			);

			if (!linkingUserInfo.user.email) {
				c.context.logger.error(
					missingEmailLogMessage(c.body.provider, { source: "id_token" }),
					{ provider: c.body.provider },
				);
				throw APIError.from(
					"UNAUTHORIZED",
					BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND,
				);
			}

			const linkedIdentity =
				await c.context.internalAdapter.findIdentityByKey(identityKey);

			if (linkedIdentity && linkedIdentity.userId !== session.user.id) {
				throw APIError.from(
					"CONFLICT",
					BASE_ERROR_CODES.SOCIAL_ACCOUNT_ALREADY_LINKED,
				);
			}
			const linkedAccount = linkedIdentity
				? await c.context.internalAdapter.findAccountByKey({
						identityId: linkedIdentity.id,
						providerInstanceId: provider.id,
					})
				: null;

			if (linkedAccount) {
				const updateData = Object.fromEntries(
					Object.entries({
						accessToken: await setTokenUtil(
							c.body.idToken.accessToken,
							c.context,
						),
						idToken: token,
						refreshToken: await setTokenUtil(
							c.body.idToken.refreshToken,
							c.context,
						),
					}).filter(([_, value]) => value !== undefined),
				);
				const updatedAccount = await c.context.internalAdapter.updateAccount(
					linkedAccount.id,
					updateData,
				);
				if (!updatedAccount || !linkedIdentity) {
					throw APIError.from("EXPECTATION_FAILED", {
						message: "Account not linked - unable to update account",
						code: "LINKING_FAILED",
					});
				}
				await applyUpdateUserInfoOnLink(
					c,
					session.user.id,
					linkingUserInfo.user,
				);
				if (c.context.options.account?.storeAccountCookie) {
					await setProviderAccountCookieForSession(
						c,
						{ account: updatedAccount, identity: linkedIdentity },
						session,
					);
				}
				return c.json({
					url: "", // this is for type inference
					status: true,
					redirect: false,
				});
			}

			const isTrustedProvider = c.context.trustedProviders.includes(
				provider.id,
			);
			if (
				!linkedIdentity &&
				((!isTrustedProvider && !linkingUserInfo.user.emailVerified) ||
					c.context.options.account?.accountLinking?.enabled === false)
			) {
				throw APIError.from("UNAUTHORIZED", {
					message: "Account not linked - linking not allowed",
					code: "LINKING_NOT_ALLOWED",
				});
			}

			if (
				!linkedIdentity &&
				linkingUserInfo.user.email?.toLowerCase() !==
					session.user.email.toLowerCase() &&
				c.context.options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				throw APIError.from("UNAUTHORIZED", {
					message: "Account not linked - different emails not allowed",
					code: "LINKING_DIFFERENT_EMAILS_NOT_ALLOWED",
				});
			}

			let linkedAccountWithIdentity: AccountWithIdentity;
			try {
				linkedAccountWithIdentity = await c.context.internalAdapter.linkAccount(
					session.user.id,
					identityKey,
					{
						providerId: provider.id,
						providerInstanceId: provider.id,
						accessToken: await setTokenUtil(
							c.body.idToken.accessToken,
							c.context,
						),
						idToken: token,
						refreshToken: await setTokenUtil(
							c.body.idToken.refreshToken,
							c.context,
						),
					},
				);
			} catch {
				throw APIError.from("EXPECTATION_FAILED", {
					message: "Account not linked - unable to create account",
					code: "LINKING_FAILED",
				});
			}

			await applyUpdateUserInfoOnLink(c, session.user.id, linkingUserInfo.user);
			if (c.context.options.account?.storeAccountCookie) {
				await setProviderAccountCookieForSession(
					c,
					linkedAccountWithIdentity,
					session,
				);
			}

			return c.json({
				url: "", // this is for type inference
				status: true,
				redirect: false,
			});
		}

		// Handle OAuth flow
		const idTokenNonce = generateIdTokenNonce(provider);
		const state = await generateState(c, {
			link: {
				userId: session.user.id,
				email: session.user.email,
			},
			additionalData: c.body.additionalData,
			idTokenNonce,
		});

		const url = await provider.createAuthorizationURL({
			state: state.state,
			codeVerifier: state.codeVerifier,
			idTokenNonce,
			redirectURI: `${c.context.baseURL}${getOAuthCallbackPath(provider)}`,
			scopes: c.body.scopes,
			loginHint: c.body.loginHint,
			additionalParams: c.body.additionalParams,
		});

		if (!c.body.disableRedirect) {
			c.setHeader("Location", url.toString());
		}

		return c.json({
			url: url.toString(),
			redirect: !c.body.disableRedirect,
		});
	},
);
export const unlinkAccount = createAuthEndpoint(
	"/unlink-account",
	{
		method: "POST",
		body: z.object({
			accountId: z.string().meta({
				description: "The Better Auth account ID to unlink",
			}),
		}),
		use: [freshSessionMiddleware],
		metadata: {
			openapi: {
				description: "Unlink an account",
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
		const { accountId } = ctx.body;
		const accounts = await ctx.context.internalAdapter.listUserAccounts(
			ctx.context.session.user.id,
		);
		if (
			accounts.length === 1 &&
			!ctx.context.options.account?.accountLinking?.allowUnlinkingAll
		) {
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
			);
		}
		const accountExist = accounts.find(
			({ account }) => account.id === accountId,
		);
		if (!accountExist) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
		}
		await ctx.context.internalAdapter.deleteAccount(accountExist.account.id);
		const accountCookie = await getAccountCookie(ctx);
		if (
			ctx.context.authenticatedProviderAccountBinding?.accountId ===
				accountExist.account.id ||
			accountCookie?.account.id === accountExist.account.id
		) {
			clearProviderAccountBindingCookie(ctx);
			expireCookie(ctx, ctx.context.authCookies.accountData);
			const accountStore = createAccountStore(
				ctx.context.authCookies.accountData.name,
				ctx.context.authCookies.accountData.attributes,
				ctx,
			);
			accountStore.setCookies(accountStore.clean());
		}
		return ctx.json({
			status: true,
		});
	},
);

/**
 * Resolves the user id an account-token operation should act on.
 *
 * A caller reaching the server over HTTP (a request or session headers are
 * present) must have a valid session, and that session's user always wins.
 * A trusted server-side `auth.api` caller with no session may instead name a
 * `userId` directly. Throws `UNAUTHORIZED` when an HTTP caller is
 * unauthenticated, and `USER_ID_OR_SESSION_REQUIRED` when neither a session
 * nor a `userId` is available.
 *
 * When a durable store is authoritative, bypasses the cookie cache: these
 * routes mint or refresh provider access tokens, so a server-side session
 * revocation must take effect immediately rather than waiting for the cached
 * cookie to expire. DB-less deployments keep the session in the cookie itself,
 * so the cache is left in place for them.
 */
async function resolveUserId(
	ctx: GenericEndpointContext,
	userId?: string,
): Promise<string> {
	const session = await getAuthoritativeSessionFromCtx(ctx);
	if (!session && (ctx.request || ctx.headers)) {
		throw ctx.error("UNAUTHORIZED");
	}
	const resolvedUserId = session?.user?.id || userId;
	if (!resolvedUserId) {
		throw APIError.from("BAD_REQUEST", {
			message: "Either userId or session is required",
			code: "USER_ID_OR_SESSION_REQUIRED",
		});
	}
	return resolvedUserId;
}

const accountCookieSelectionSchema = z.preprocess(
	(value) => (value === "true" ? true : value),
	z.literal(true).meta({
		description: "Select the current OAuth account from its signed cookie",
	}),
);

const accountSelectionSchema = z.union([
	z.strictObject({
		accountId: z.string().meta({
			description: "The Better Auth account ID",
		}),
		userId: z
			.string()
			.meta({
				description: "The user ID associated with the account",
			})
			.optional(),
	}),
	z.strictObject({
		useAccountCookie: accountCookieSelectionSchema,
		userId: z
			.string()
			.meta({
				description: "The user ID associated with the account",
			})
			.optional(),
	}),
]);

type AccountSelection = { accountId: string } | { useAccountCookie: true };

async function matchesAccountSelection(
	ctx: GenericEndpointContext,
	accountWithIdentity: AccountWithIdentity,
	accountCookie: ProviderAccountCookie | null,
	{
		resolvedUserId,
		selection,
	}: {
		resolvedUserId: string;
		selection: AccountSelection;
	},
) {
	if ("accountId" in selection) {
		return (
			accountWithIdentity.identity.userId === resolvedUserId &&
			accountWithIdentity.account.id === selection.accountId
		);
	}
	if (!accountCookie) return false;
	const matchesAccountCookie =
		accountWithIdentity.account.id === accountCookie.account.id &&
		accountWithIdentity.account.providerInstanceId ===
			accountCookie.account.providerInstanceId &&
		accountWithIdentity.identity.issuer === accountCookie.identity.issuer &&
		accountWithIdentity.identity.providerAccountId ===
			accountCookie.identity.providerAccountId;
	return (
		matchesAccountCookie &&
		hasMatchingAuthenticatedProviderAccountBinding(
			accountCookie,
			ctx.context.authenticatedProviderAccountBinding,
		) &&
		(!shouldBindAccountCookieToSessionUser(ctx.context.options) ||
			accountWithIdentity.identity.userId === resolvedUserId)
	);
}

/**
 * Resolves an account from exactly one explicit source.
 *
 * A local account ID is resolved from the database. A signed account cookie is
 * used only when the caller explicitly selects it, which keeps stateless OAuth
 * flows usable without letting cached cookie data satisfy a row-ID lookup.
 */
async function resolveUserAccount(
	ctx: GenericEndpointContext,
	{
		resolvedUserId,
		selection,
	}: {
		resolvedUserId: string;
		selection: AccountSelection;
	},
): Promise<{
	accountWithIdentity: AccountWithIdentity;
	accountCookie: ProviderAccountCookie | null;
}> {
	if ("accountId" in selection) {
		const accountWithIdentity =
			await ctx.context.internalAdapter.findAccountWithIdentityById(
				selection.accountId,
			);
		if (
			accountWithIdentity &&
			(await matchesAccountSelection(ctx, accountWithIdentity, null, {
				resolvedUserId,
				selection,
			}))
		) {
			return { accountWithIdentity, accountCookie: null };
		}
	} else {
		const accountCookie = await getAccountCookie(ctx);
		const accountWithIdentity =
			accountCookie && hasServerAccountStore(ctx.context.options)
				? await ctx.context.internalAdapter.findAccountWithIdentityById(
						accountCookie.account.id,
					)
				: accountCookie;
		if (
			accountWithIdentity &&
			(await matchesAccountSelection(ctx, accountWithIdentity, accountCookie, {
				resolvedUserId,
				selection,
			}))
		) {
			return {
				accountWithIdentity,
				accountCookie,
			};
		}
	}

	throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
}

/**
 * Fetches a currently-valid access token for a user's provider account,
 * refreshing and persisting it when it is within five seconds of expiry.
 * Shared by the `/get-access-token` endpoint and `/account-info` so both
 * resolve and refresh tokens through one path.
 */
async function getValidAccessToken(
	ctx: GenericEndpointContext,
	{
		resolvedUserId,
		selection,
		accountWithIdentity: resolvedAccount,
		accountCookie: suppliedAccountCookie,
	}: {
		resolvedUserId: string;
		selection: AccountSelection;
		/**
		 * An already-resolved account. When provided, skips the cookie and
		 * database lookup so a caller that has the account in hand does not
		 * re-query for it.
		 */
		accountWithIdentity?: AccountWithIdentity;
		accountCookie?: ProviderAccountCookie | null;
	},
) {
	const resolved = resolvedAccount
		? {
				accountWithIdentity: resolvedAccount,
				accountCookie: suppliedAccountCookie ?? null,
			}
		: await resolveUserAccount(ctx, { resolvedUserId, selection });
	const { accountWithIdentity, accountCookie } = resolved;
	if (
		!(await matchesAccountSelection(ctx, accountWithIdentity, accountCookie, {
			resolvedUserId,
			selection,
		}))
	) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
	}
	const { account, identity } = accountWithIdentity;

	// Resolved by instance so a provider alias cannot reach another provider's
	// client credentials.
	const provider = await getAwaitableValue(ctx.context.socialProviders, {
		value: account.providerInstanceId,
	});
	if (!provider) {
		throw APIError.from("BAD_REQUEST", {
			message: `Provider ${account.providerId} is not supported.`,
			code: "PROVIDER_NOT_SUPPORTED",
		});
	}

	try {
		let newTokens: OAuth2Tokens | null = null;
		const accessTokenExpired =
			account.accessTokenExpiresAt &&
			new Date(account.accessTokenExpiresAt).getTime() - Date.now() < 5_000;
		if (
			account.refreshToken &&
			accessTokenExpired &&
			provider.refreshAccessToken
		) {
			const refreshToken = await decryptOAuthToken(
				account.refreshToken,
				ctx.context,
			);
			newTokens = await provider.refreshAccessToken(refreshToken, ctx);
			const updatedData = {
				accessToken: await setTokenUtil(newTokens?.accessToken, ctx.context),
				accessTokenExpiresAt: newTokens?.accessTokenExpiresAt,
				refreshToken: newTokens?.refreshToken
					? await setTokenUtil(newTokens.refreshToken, ctx.context)
					: account.refreshToken,
				refreshTokenExpiresAt:
					newTokens?.refreshTokenExpiresAt ?? account.refreshTokenExpiresAt,
				idToken: newTokens?.idToken || account.idToken,
			};
			let updatedAccount: Partial<Account> | null = null;
			if (account.id) {
				updatedAccount = await ctx.context.internalAdapter.updateAccount(
					account.id,
					updatedData,
				);
			}
			if (hasServerAccountStore(ctx.context.options) && !updatedAccount) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
			}
			if (
				ctx.context.options.account?.storeAccountCookie &&
				accountCookie?.account.id === account.id &&
				ctx.context.session
			) {
				await setProviderAccountCookieForSession(
					ctx,
					{
						account: {
							...account,
							...(updatedAccount ?? updatedData),
						},
						identity,
					},
					ctx.context.session,
					accountCookie.accountBindingId,
				);
			}
		}

		const accessTokenExpiresAt = (() => {
			if (newTokens?.accessTokenExpiresAt) {
				if (typeof newTokens.accessTokenExpiresAt === "string") {
					return new Date(newTokens.accessTokenExpiresAt);
				}
				return newTokens.accessTokenExpiresAt;
			}
			if (account.accessTokenExpiresAt) {
				if (typeof account.accessTokenExpiresAt === "string") {
					return new Date(account.accessTokenExpiresAt);
				}
				return account.accessTokenExpiresAt;
			}
			return undefined;
		})();

		return {
			accessToken:
				newTokens?.accessToken ??
				(await decryptOAuthToken(account.accessToken ?? "", ctx.context)),
			accessTokenExpiresAt,
			scopes: parseStoredScopes(account.scope),
			idToken: newTokens?.idToken ?? account.idToken ?? undefined,
		};
	} catch (error) {
		if (isAPIError(error)) throw error;
		throw APIError.from("BAD_REQUEST", {
			message: "Failed to get a valid access token",
			code: "FAILED_TO_GET_ACCESS_TOKEN",
		});
	}
}

export const getAccessToken = createAuthEndpoint(
	"/get-access-token",
	{
		method: "POST",
		body: accountSelectionSchema,
		metadata: {
			openapi: {
				description: "Get a valid access token, doing a refresh if needed",
				responses: {
					200: {
						description: "A Valid access token",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										tokenType: {
											type: "string",
										},
										idToken: {
											type: "string",
										},
										accessToken: {
											type: "string",
										},
										accessTokenExpiresAt: {
											type: "string",
											format: "date-time",
										},
									},
								},
							},
						},
					},
					400: {
						description: "Invalid refresh token or provider configuration",
					},
				},
			},
		},
	},
	async (ctx) => {
		const { userId } = ctx.body;
		const resolvedUserId = await resolveUserId(ctx, userId);
		const tokens = await getValidAccessToken(ctx, {
			resolvedUserId,
			selection: ctx.body,
		});
		return ctx.json(tokens);
	},
);

export const refreshToken = createAuthEndpoint(
	"/refresh-token",
	{
		method: "POST",
		body: accountSelectionSchema,
		metadata: {
			openapi: {
				description: "Refresh the access token using a refresh token",
				responses: {
					200: {
						description: "Access token refreshed successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										tokenType: {
											type: "string",
										},
										idToken: {
											type: "string",
										},
										accessToken: {
											type: "string",
										},
										refreshToken: {
											type: "string",
										},
										accessTokenExpiresAt: {
											type: "string",
											format: "date-time",
										},
										refreshTokenExpiresAt: {
											type: "string",
											format: "date-time",
										},
									},
								},
							},
						},
					},
					400: {
						description: "Invalid refresh token or provider configuration",
					},
				},
			},
		},
	},
	async (ctx) => {
		const { userId } = ctx.body;
		const resolvedUserId = await resolveUserId(ctx, userId);
		const { accountWithIdentity, accountCookie } = await resolveUserAccount(
			ctx,
			{
				resolvedUserId,
				selection: ctx.body,
			},
		);
		const { account } = accountWithIdentity;
		const provider = await getAwaitableValue(ctx.context.socialProviders, {
			value: account.providerInstanceId,
		});
		if (!provider) {
			throw APIError.from("BAD_REQUEST", {
				message: `Provider ${account.providerId} is not supported.`,
				code: "PROVIDER_NOT_SUPPORTED",
			});
		}
		if (!provider.refreshAccessToken) {
			throw APIError.from("BAD_REQUEST", {
				message: `Provider ${account.providerId} does not support token refreshing.`,
				code: "TOKEN_REFRESH_NOT_SUPPORTED",
			});
		}

		const refreshToken = account.refreshToken ?? undefined;

		if (!refreshToken) {
			throw APIError.from("BAD_REQUEST", {
				message: "Refresh token not found",
				code: "REFRESH_TOKEN_NOT_FOUND",
			});
		}

		try {
			const decryptedRefreshToken = await decryptOAuthToken(
				refreshToken,
				ctx.context,
			);
			const tokens: OAuth2Tokens = await provider.refreshAccessToken(
				decryptedRefreshToken,
				ctx,
			);

			const resolvedRefreshToken = tokens.refreshToken
				? await setTokenUtil(tokens.refreshToken, ctx.context)
				: refreshToken;
			const resolvedRefreshTokenExpiresAt =
				tokens.refreshTokenExpiresAt ?? account.refreshTokenExpiresAt;
			const updatedTokenData: Partial<Account> = {
				accessToken: await setTokenUtil(tokens.accessToken, ctx.context),
				refreshToken: resolvedRefreshToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
				refreshTokenExpiresAt: resolvedRefreshTokenExpiresAt,
				idToken: tokens.idToken || account.idToken,
			};
			let updatedAccount: Account | null = null;

			if (account.id) {
				/**
				 * `scope` intentionally omitted. Refresh response may be narrower.
				 *
				 * @see {@link Account.scope}
				 */
				updatedAccount = await ctx.context.internalAdapter.updateAccount(
					account.id,
					updatedTokenData,
				);
			}
			if (hasServerAccountStore(ctx.context.options) && !updatedAccount) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
			}

			if (
				accountCookie?.account.id === account.id &&
				ctx.context.options.account?.storeAccountCookie &&
				ctx.context.session
			) {
				const updateData = {
					account: {
						...accountCookie.account,
						...(updatedAccount ?? updatedTokenData),
					},
					identity: accountCookie.identity,
				};
				await setProviderAccountCookieForSession(
					ctx,
					updateData,
					ctx.context.session,
					accountCookie.accountBindingId,
				);
			}
			const responseScope = updatedAccount?.scope ?? account.scope;
			return ctx.json({
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken ?? decryptedRefreshToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
				refreshTokenExpiresAt: resolvedRefreshTokenExpiresAt,
				scope: responseScope,
				idToken: tokens.idToken || account.idToken,
				providerId: account.providerId,
				accountId: account.id,
			});
		} catch (error) {
			if (isAPIError(error)) throw error;
			throw APIError.from("BAD_REQUEST", {
				message: "Failed to refresh access token",
				code: "FAILED_TO_REFRESH_ACCESS_TOKEN",
			});
		}
	},
);

export const accountInfo = createAuthEndpoint(
	"/account-info",
	{
		method: "GET",
		metadata: {
			openapi: {
				description: "Get the account info provided by the provider",
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
											properties: {
												name: {
													type: "string",
												},
												email: {
													type: "string",
													nullable: true,
												},
												image: {
													type: "string",
												},
												emailVerified: {
													type: "boolean",
												},
											},
											required: ["emailVerified"],
										},
										account: {
											type: "object",
											properties: {
												id: { type: "string" },
												providerId: { type: "string" },
												identity: {
													type: "object",
													properties: {
														id: { type: "string" },
														issuer: { type: "string" },
														providerAccountId: { type: "string" },
													},
													required: ["id", "issuer", "providerAccountId"],
													additionalProperties: false,
												},
											},
											required: ["id", "providerId", "identity"],
											additionalProperties: false,
										},
										data: {
											type: "object",
											properties: {},
											additionalProperties: true,
										},
									},
									required: ["user", "data", "account"],
									additionalProperties: false,
								},
							},
						},
					},
				},
			},
		},
		query: accountSelectionSchema,
	},
	async (ctx) => {
		const { userId } = ctx.query;
		const resolvedUserId = await resolveUserId(ctx, userId);
		const { accountWithIdentity, accountCookie } = await resolveUserAccount(
			ctx,
			{
				resolvedUserId,
				selection: ctx.query,
			},
		);
		const { account } = accountWithIdentity;

		const provider = await getAwaitableValue(ctx.context.socialProviders, {
			value: account.providerInstanceId,
		});

		if (!provider) {
			throw APIError.from("BAD_REQUEST", {
				message: "Account is not associated with a configured social provider.",
				code: "PROVIDER_NOT_CONFIGURED",
			});
		}
		const tokens = await getValidAccessToken(ctx, {
			resolvedUserId,
			selection: ctx.query,
			accountWithIdentity,
			accountCookie,
		});
		if (!tokens.accessToken) {
			throw APIError.from("BAD_REQUEST", {
				message: "Access token not found",
				code: "ACCESS_TOKEN_NOT_FOUND",
			});
		}
		const info = await provider.getUserInfo({
			...tokens,
			accessToken: tokens.accessToken,
		});
		if (!info) {
			throw APIError.from(
				"UNAUTHORIZED",
				BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
			);
		}
		return ctx.json({
			...info,
			account: {
				id: account.id,
				providerId: account.providerId,
				identity: {
					id: accountWithIdentity.identity.id,
					issuer: accountWithIdentity.identity.issuer,
					providerAccountId: accountWithIdentity.identity.providerAccountId,
				},
			},
		});
	},
);
