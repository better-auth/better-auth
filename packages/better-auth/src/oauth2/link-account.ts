import { APIError, createEmailVerificationToken } from "../api";
import type { Account } from "../types";
import type { GenericEndpointContext, User } from "../types";
import { logger } from "../utils";
import { isDevelopment } from "../utils/env";

export async function handleOAuthUserInfo(
	c: GenericEndpointContext,
	{
		userInfo,
		account,
		callbackURL,
		disableSignUp,
		overrideUserInfo,
	}: {
		userInfo: User;
		account: Omit<Account, "id" | "userId" | "createdAt" | "updatedAt">;
		callbackURL?: string;
		disableSignUp?: boolean;
		overrideUserInfo?: boolean | string[];
	},
) {
	const dbUser = await c.context.internalAdapter
		.findOAuthUser(
			userInfo.email.toLowerCase(),
			account.accountId,
			account.providerId,
		)
		.catch((e) => {
			logger.error(
				"Better auth was unable to query your database.\nError: ",
				e,
			);
			throw c.redirect(
				`${c.context.baseURL}/error?error=internal_server_error`,
			);
		});
	let user = dbUser?.user;
	let isRegister = !user;

	if (dbUser) {
		const hasBeenLinked = dbUser.accounts.find(
			(a) => a.providerId === account.providerId,
		);
		if (!hasBeenLinked) {
			const trustedProviders =
				c.context.options.account?.accountLinking?.trustedProviders;
			const isTrustedProvider = trustedProviders?.includes(
				account.providerId as "apple",
			);
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				c.context.options.account?.accountLinking?.enabled === false
			) {
				if (isDevelopment) {
					logger.warn(
						`User already exist but account isn't linked to ${account.providerId}. To read more about how account linking works in Better Auth see https://www.better-auth.com/docs/concepts/users-accounts#account-linking.`,
					);
				}
				return {
					error: "account not linked",
					data: null,
				};
			}
			try {
				await c.context.internalAdapter.linkAccount(
					{
						providerId: account.providerId,
						accountId: userInfo.id.toString(),
						userId: dbUser.user.id,
						accessToken: account.accessToken,
						idToken: account.idToken,
						refreshToken: account.refreshToken,
						accessTokenExpiresAt: account.accessTokenExpiresAt,
						refreshTokenExpiresAt: account.refreshTokenExpiresAt,
						scope: account.scope,
					},
					c,
				);
			} catch (e) {
				logger.error("Unable to link account", e);
				return {
					error: "unable to link account",
					data: null,
				};
			}
		} else {
			const updateData = Object.fromEntries(
				Object.entries({
					accessToken: account.accessToken,
					idToken: account.idToken,
					refreshToken: account.refreshToken,
					accessTokenExpiresAt: account.accessTokenExpiresAt,
					refreshTokenExpiresAt: account.refreshTokenExpiresAt,
					scope: account.scope,
				}).filter(([_, value]) => value !== undefined),
			);

			if (Object.keys(updateData).length > 0) {
				await c.context.internalAdapter.updateAccount(
					hasBeenLinked.id,
					updateData,
					c,
				);
			}
		}

		const {
			id: _,
			name,
			email,
			emailVerified,
			image,
			createdAt,
			...restUserInfo
		} = userInfo;
		const coreFields =
			typeof overrideUserInfo === "boolean"
				? {
						name,
						email,
						emailVerified,
						image,
					}
				: Object.fromEntries(
						Object.entries({
							name,
							email,
							emailVerified,
							image,
							createdAt,
						}).filter(([key]) => overrideUserInfo?.includes(key)),
					);
		await c.context.internalAdapter.updateUser(dbUser.user.id, {
			...coreFields, // core fields should be updated only if overrideUserInfo is true
			...restUserInfo, // rest of the user info should be updated always
		});
	} else {
		if (disableSignUp) {
			return {
				error: "signup disabled",
				data: null,
				isRegister: false,
			};
		}
		try {
			const { id: _, ...restUserInfo } = userInfo;
			user = await c.context.internalAdapter
				.createOAuthUser(
					{
						...restUserInfo,
						email: userInfo.email.toLowerCase(),
					},
					{
						accessToken: account.accessToken,
						idToken: account.idToken,
						refreshToken: account.refreshToken,
						accessTokenExpiresAt: account.accessTokenExpiresAt,
						refreshTokenExpiresAt: account.refreshTokenExpiresAt,
						scope: account.scope,
						providerId: account.providerId,
						accountId: userInfo.id.toString(),
					},
					c,
				)
				.then((res) => res?.user);
			if (
				!userInfo.emailVerified &&
				user &&
				c.context.options.emailVerification?.sendOnSignUp
			) {
				const token = await createEmailVerificationToken(
					c.context.secret,
					user.email,
					undefined,
					c.context.options.emailVerification?.expiresIn,
				);
				const url = `${c.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
				await c.context.options.emailVerification?.sendVerificationEmail?.(
					{
						user,
						url,
						token,
					},
					c.request,
				);
			}
		} catch (e: any) {
			logger.error(e);
			if (e instanceof APIError) {
				return {
					error: e.message,
					data: null,
					isRegister: false,
				};
			}
			return {
				error: "unable to create user",
				data: null,
				isRegister: false,
			};
		}
	}
	if (!user) {
		return {
			error: "unable to create user",
			data: null,
			isRegister: false,
		};
	}

	const session = await c.context.internalAdapter.createSession(
		user.id,
		c.headers,
	);
	if (!session) {
		return {
			error: "unable to create session",
			data: null,
			isRegister: false,
		};
	}
	return {
		data: {
			session,
			user,
		},
		error: null,
		isRegister,
	};
}
