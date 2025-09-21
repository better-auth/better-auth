import { implEndpoint } from "../../better-call/server";
import { APIError } from "better-call";
import {
	generateState,
	decryptOAuthToken,
	setTokenUtil,
	type OAuth2Tokens,
} from "../../oauth2";
import {
	freshSessionMiddleware,
	getSessionFromCtx,
	sessionMiddleware,
} from "./session";
import { BASE_ERROR_CODES } from "../../error/codes";
import {
	listUserAccountsDef,
	linkSocialAccountDef,
	unlinkAccountDef,
	getAccessTokenDef,
	refreshTokenDef,
	accountInfoDef,
} from "./shared";

export const listUserAccounts = () =>
	implEndpoint(listUserAccountsDef, [sessionMiddleware], async (c) => {
		const session = c.context.session;
		const accounts = await c.context.internalAdapter.findAccounts(
			session.user.id,
		);
		return c.json(
			accounts.map((a) => ({
				id: a.id,
				providerId: a.providerId,
				createdAt: a.createdAt,
				updatedAt: a.updatedAt,
				accountId: a.accountId,
				scopes: a.scope?.split(",") || [],
			})),
		);
	});

export const linkSocialAccount = () =>
	implEndpoint(linkSocialAccountDef, [sessionMiddleware], async (c) => {
		const session = c.context.session;

		const provider = c.context.socialProviders.find(
			(p) => p.id === c.body.provider,
		);

		if (!provider) {
			c.context.logger.error(
				"Provider not found. Make sure to add the provider in your auth config",
				{
					provider: c.body.provider,
				},
			);
			throw new APIError("NOT_FOUND", {
				message: BASE_ERROR_CODES.PROVIDER_NOT_FOUND,
			});
		}

		// Handle ID Token flow if provided
		if (c.body.idToken) {
			if (!provider.verifyIdToken) {
				c.context.logger.error(
					"Provider does not support id token verification",
					{
						provider: c.body.provider,
					},
				);
				throw new APIError("NOT_FOUND", {
					message: BASE_ERROR_CODES.ID_TOKEN_NOT_SUPPORTED,
				});
			}

			const { token, nonce } = c.body.idToken;
			const valid = await provider.verifyIdToken(token, nonce);
			if (!valid) {
				c.context.logger.error("Invalid id token", {
					provider: c.body.provider,
				});
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.INVALID_TOKEN,
				});
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
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
				});
			}

			const linkingUserId = String(linkingUserInfo.user.id);

			if (!linkingUserInfo.user.email) {
				c.context.logger.error("User email not found", {
					provider: c.body.provider,
				});
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND,
				});
			}

			const existingAccounts = await c.context.internalAdapter.findAccounts(
				session.user.id,
			);

			const hasBeenLinked = existingAccounts.find(
				(a) => a.providerId === provider.id && a.accountId === linkingUserId,
			);

			if (hasBeenLinked) {
				return c.json({
					url: "", // this is for type inference
					status: true,
					redirect: false,
				});
			}

			const trustedProviders =
				c.context.options.account?.accountLinking?.trustedProviders;

			const isTrustedProvider = trustedProviders?.includes(provider.id);
			if (
				(!isTrustedProvider && !linkingUserInfo.user.emailVerified) ||
				c.context.options.account?.accountLinking?.enabled === false
			) {
				throw new APIError("UNAUTHORIZED", {
					message: "Account not linked - linking not allowed",
				});
			}

			if (
				linkingUserInfo.user.email !== session.user.email &&
				c.context.options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				throw new APIError("UNAUTHORIZED", {
					message: "Account not linked - different emails not allowed",
				});
			}

			try {
				await c.context.internalAdapter.createAccount(
					{
						userId: session.user.id,
						providerId: provider.id,
						accountId: linkingUserId,
						accessToken: c.body.idToken.accessToken,
						idToken: token,
						refreshToken: c.body.idToken.refreshToken,
						scope: c.body.idToken.scopes?.join(","),
					},
					c,
				);
			} catch (e: any) {
				throw new APIError("EXPECTATION_FAILED", {
					message: "Account not linked - unable to create account",
				});
			}

			if (
				c.context.options.account?.accountLinking?.updateUserInfoOnLink === true
			) {
				try {
					await c.context.internalAdapter.updateUser(session.user.id, {
						name: linkingUserInfo.user?.name,
						image: linkingUserInfo.user?.image,
					});
				} catch (e: any) {
					console.warn("Could not update user - " + e.toString());
				}
			}

			return c.json({
				url: "", // this is for type inference
				status: true,
				redirect: false,
			});
		}

		// Handle OAuth flow
		const state = await generateState(c, {
			userId: session.user.id,
			email: session.user.email,
		});

		const url = await provider.createAuthorizationURL({
			state: state.state,
			codeVerifier: state.codeVerifier,
			redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
			scopes: c.body.scopes,
		});

		return c.json({
			url: url.toString(),
			redirect: !c.body.disableRedirect,
		});
	});
export const unlinkAccount = () =>
	implEndpoint(unlinkAccountDef, [freshSessionMiddleware], async (ctx) => {
		const { providerId, accountId } = ctx.body;
		const accounts = await ctx.context.internalAdapter.findAccounts(
			ctx.context.session.user.id,
		);
		if (
			accounts.length === 1 &&
			!ctx.context.options.account?.accountLinking?.allowUnlinkingAll
		) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
			});
		}
		const accountExist = accounts.find((account) =>
			accountId
				? account.accountId === accountId && account.providerId === providerId
				: account.providerId === providerId,
		);
		if (!accountExist) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.ACCOUNT_NOT_FOUND,
			});
		}
		await ctx.context.internalAdapter.deleteAccount(accountExist.id);
		return ctx.json({
			status: true,
		});
	});

export const getAccessToken = () =>
	implEndpoint(getAccessTokenDef, async (ctx) => {
		const { providerId, accountId, userId } = ctx.body;
		const req = ctx.request;
		const session = await getSessionFromCtx(ctx);
		if (req && !session) {
			throw ctx.error("UNAUTHORIZED");
		}
		let resolvedUserId = session?.user?.id || userId;
		if (!resolvedUserId) {
			throw new APIError("BAD_REQUEST", {
				message: `Either userId or session is required`,
			});
		}
		if (!ctx.context.socialProviders.find((p) => p.id === providerId)) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} is not supported.`,
			});
		}
		const accounts =
			await ctx.context.internalAdapter.findAccounts(resolvedUserId);
		const account = accounts.find((acc) =>
			accountId
				? acc.id === accountId && acc.providerId === providerId
				: acc.providerId === providerId,
		);
		if (!account) {
			throw new APIError("BAD_REQUEST", {
				message: "Account not found",
			});
		}
		const provider = ctx.context.socialProviders.find(
			(p) => p.id === providerId,
		);
		if (!provider) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} not found.`,
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
				newTokens = await provider.refreshAccessToken(
					account.refreshToken as string,
				);
				await ctx.context.internalAdapter.updateAccount(account.id, {
					accessToken: await setTokenUtil(newTokens.accessToken, ctx.context),
					accessTokenExpiresAt: newTokens.accessTokenExpiresAt,
					refreshToken: await setTokenUtil(newTokens.refreshToken, ctx.context),
					refreshTokenExpiresAt: newTokens.refreshTokenExpiresAt,
				});
			}
			const tokens = {
				accessToken: await decryptOAuthToken(
					newTokens?.accessToken ?? account.accessToken ?? "",
					ctx.context,
				),
				accessTokenExpiresAt:
					newTokens?.accessTokenExpiresAt ??
					account.accessTokenExpiresAt ??
					undefined,
				scopes: account.scope?.split(",") ?? [],
				idToken: newTokens?.idToken ?? account.idToken ?? undefined,
			};
			return ctx.json(tokens);
		} catch (error) {
			throw new APIError("BAD_REQUEST", {
				message: "Failed to get a valid access token",
				cause: error,
			});
		}
	});

export const refreshToken = () =>
	implEndpoint(refreshTokenDef, async (ctx) => {
		const { providerId, accountId, userId } = ctx.body;
		const req = ctx.request;
		const session = await getSessionFromCtx(ctx);
		if (req && !session) {
			throw ctx.error("UNAUTHORIZED");
		}
		let resolvedUserId = session?.user?.id || userId;
		if (!resolvedUserId) {
			throw new APIError("BAD_REQUEST", {
				message: `Either userId or session is required`,
			});
		}
		const accounts =
			await ctx.context.internalAdapter.findAccounts(resolvedUserId);
		const account = accounts.find((acc) =>
			accountId
				? acc.id === accountId && acc.providerId === providerId
				: acc.providerId === providerId,
		);
		if (!account) {
			throw new APIError("BAD_REQUEST", {
				message: "Account not found",
			});
		}
		const provider = ctx.context.socialProviders.find(
			(p) => p.id === providerId,
		);
		if (!provider) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} not found.`,
			});
		}
		if (!provider.refreshAccessToken) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} does not support token refreshing.`,
			});
		}
		try {
			const tokens: OAuth2Tokens = await provider.refreshAccessToken(
				account.refreshToken as string,
			);
			await ctx.context.internalAdapter.updateAccount(account.id, {
				accessToken: await setTokenUtil(tokens.accessToken, ctx.context),
				refreshToken: await setTokenUtil(tokens.refreshToken, ctx.context),
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
				refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
			});
			return ctx.json(tokens);
		} catch (error) {
			throw new APIError("BAD_REQUEST", {
				message: "Failed to refresh access token",
				cause: error,
			});
		}
	});

export const accountInfo = () =>
	implEndpoint(accountInfoDef, [sessionMiddleware], async (ctx) => {
		const account = await ctx.context.internalAdapter.findAccount(
			ctx.body.accountId,
		);

		if (!account || account.userId !== ctx.context.session.user.id) {
			throw new APIError("BAD_REQUEST", {
				message: "Account not found",
			});
		}

		const provider = ctx.context.socialProviders.find(
			(p) => p.id === account.providerId,
		);

		if (!provider) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: `Provider account provider is ${account.providerId} but it is not configured`,
			});
		}
		const tokens = await getAccessToken({
			...ctx,
			body: {
				accountId: account.id,
				providerId: account.providerId,
			},
			returnHeaders: false,
		});
		if (!tokens.accessToken) {
			throw new APIError("BAD_REQUEST", {
				message: "Access token not found",
			});
		}
		const info = await provider.getUserInfo({
			...tokens,
			accessToken: tokens.accessToken as string,
		});
		return ctx.json(info);
	});
