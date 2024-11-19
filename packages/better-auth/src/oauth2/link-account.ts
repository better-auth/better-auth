import { createEmailVerificationToken } from "../api";
import type { Account } from "../db/schema";
import type { GenericEndpointContext, User } from "../types";
import { logger } from "../utils";
import { isDevelopment } from "../utils/env";

export async function handleOAuthUserInfo(
	c: GenericEndpointContext,
	{
		userInfo,
		account,
		callbackURL,
	}: {
		userInfo: Omit<User, "createdAt" | "updatedAt">;
		account: Omit<Account, "id" | "userId" | "createdAt" | "updatedAt">;
		callbackURL?: string;
	},
) {
	const dbUser = await c.context.internalAdapter
		.findUserByEmail(userInfo.email.toLowerCase(), {
			includeAccounts: true,
		})
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
				await c.context.internalAdapter.linkAccount({
					providerId: account.providerId,
					accountId: userInfo.id.toString(),
					userId: dbUser.user.id,
					accessToken: account.accessToken,
					idToken: account.idToken,
					refreshToken: account.refreshToken,
					accessTokenExpiresAt: account.accessTokenExpiresAt,
					refreshTokenExpiresAt: account.refreshTokenExpiresAt,
					scope: account.scope,
				});
			} catch (e) {
				logger.error("Unable to link account", e);
				return {
					error: "unable to link account",
					data: null,
				};
			}
		} else {
			await c.context.internalAdapter.updateAccount(hasBeenLinked.id, {
				accessToken: account.accessToken,
				idToken: account.idToken,
				refreshToken: account.refreshToken,
				accessTokenExpiresAt: account.accessTokenExpiresAt,
				refreshTokenExpiresAt: account.refreshTokenExpiresAt,
			});
		}
	} else {
		try {
			const emailVerified = userInfo.emailVerified || false;
			user = await c.context.internalAdapter
				.createOAuthUser(
					{
						...userInfo,
						// setting id to undefined to let the database generate it
						id: undefined,
						emailVerified,
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
				)
				.then((res) => res?.user);
			if (
				!emailVerified &&
				user &&
				c.context.options.emailVerification?.sendOnSignUp
			) {
				const token = await createEmailVerificationToken(
					c.context.secret,
					user.email,
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
		} catch (e) {
			logger.error("Unable to create user", e);
			return {
				error: "unable to create user",
				data: null,
			};
		}
	}
	if (!user) {
		return {
			error: "unable to create user",
			data: null,
		};
	}

	const session = await c.context.internalAdapter.createSession(
		user.id,
		c.request,
	);
	if (!session) {
		return {
			error: "unable to create session",
			data: null,
		};
	}
	return {
		data: {
			session,
			user,
		},
		error: null,
	};
}
