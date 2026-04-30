import type { GenericEndpointContext } from "@better-auth/core";
import { isDevelopment, logger } from "@better-auth/core/env";
import { createEmailVerificationToken } from "../api";
import { setAccountCookie } from "../cookies/session-store";
import type { Account, User } from "../types";
import { isAPIError } from "../utils/is-api-error";
import { setTokenUtil } from "./utils";

// TODO(#9124): v2 widens `User.email` to nullable; every `userInfo.email.toLowerCase()`
// call below needs null-safety, and `findOAuthUser` must accept a nullable email.
export async function handleOAuthUserInfo(
	c: GenericEndpointContext,
	opts: {
		userInfo: Omit<User, "createdAt" | "updatedAt">;
		account: Omit<Account, "id" | "userId" | "createdAt" | "updatedAt">;
		callbackURL?: string | undefined;
		disableSignUp?: boolean | undefined;
		overrideUserInfo?: boolean | undefined;
		isTrustedProvider?: boolean | undefined;
		/**
		 * When provided, the account will be linked to this specific user
		 * instead of looking up by email. Used by linkSocial through oauth-proxy.
		 */
		linkUserId?: string | undefined;
	},
) {
	const {
		userInfo,
		account,
		callbackURL,
		disableSignUp,
		overrideUserInfo,
		linkUserId,
	} = opts;

	// If linkUserId is provided, this is a linking operation from linkSocial
	// Link directly to the specified user instead of looking up by email
	if (linkUserId) {
		return handleLinkToUser(c, {
			userInfo,
			account,
			linkUserId,
			isTrustedProvider: opts.isTrustedProvider,
		});
	}

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
			const errorURL =
				c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
			throw c.redirect(`${errorURL}?error=internal_server_error`);
		});
	let user = dbUser?.user;
	const isRegister = !user;

	if (dbUser) {
		const linkedAccount =
			dbUser.linkedAccount ??
			dbUser.accounts.find(
				(acc) =>
					acc.providerId === account.providerId &&
					acc.accountId === account.accountId,
			);
		if (!linkedAccount) {
			const accountLinking = c.context.options.account?.accountLinking;
			const isTrustedProvider =
				opts.isTrustedProvider ||
				c.context.trustedProviders.includes(account.providerId);
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				accountLinking?.enabled === false ||
				accountLinking?.disableImplicitLinking === true
			) {
				if (isDevelopment()) {
					logger.warn(
						`User already exist but account isn't linked to ${account.providerId}. To read more about how account linking works in Better Auth see https://www.better-auth.com/docs/concepts/users-accounts#account-linking.`,
					);
				}
				return {
					error: "account not linked",
					data: null,
					isRegister: false,
				};
			}
			try {
				await c.context.internalAdapter.linkAccount({
					providerId: account.providerId,
					accountId: userInfo.id.toString(),
					userId: dbUser.user.id,
					accessToken: await setTokenUtil(account.accessToken, c.context),
					refreshToken: await setTokenUtil(account.refreshToken, c.context),
					idToken: account.idToken,
					accessTokenExpiresAt: account.accessTokenExpiresAt,
					refreshTokenExpiresAt: account.refreshTokenExpiresAt,
					scope: account.scope,
				});
			} catch (e) {
				logger.error("Unable to link account", e);
				return {
					error: "unable to link account",
					data: null,
					isRegister: false,
				};
			}

			if (
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			) {
				await c.context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
			}
		} else {
			const freshTokens =
				c.context.options.account?.updateAccountOnSignIn !== false
					? Object.fromEntries(
							Object.entries({
								idToken: account.idToken,
								accessToken: await setTokenUtil(account.accessToken, c.context),
								refreshToken: await setTokenUtil(
									account.refreshToken,
									c.context,
								),
								accessTokenExpiresAt: account.accessTokenExpiresAt,
								refreshTokenExpiresAt: account.refreshTokenExpiresAt,
								scope: account.scope,
							}).filter(([_, value]) => value !== undefined),
						)
					: {};

			if (c.context.options.account?.storeAccountCookie) {
				await setAccountCookie(c, {
					...linkedAccount,
					...freshTokens,
				});
			}

			if (Object.keys(freshTokens).length > 0) {
				await c.context.internalAdapter.updateAccount(
					linkedAccount.id,
					freshTokens,
				);
			}

			if (
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			) {
				await c.context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
			}
		}
		if (overrideUserInfo) {
			const { id: _, ...restUserInfo } = userInfo;
			// update user info from the provider if overrideUserInfo is true
			user = await c.context.internalAdapter.updateUser(dbUser.user.id, {
				...restUserInfo,
				email: userInfo.email.toLowerCase(),
				emailVerified:
					userInfo.email.toLowerCase() === dbUser.user.email
						? dbUser.user.emailVerified || userInfo.emailVerified
						: userInfo.emailVerified,
			});
		}
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
			const accountData = {
				accessToken: await setTokenUtil(account.accessToken, c.context),
				refreshToken: await setTokenUtil(account.refreshToken, c.context),
				idToken: account.idToken,
				accessTokenExpiresAt: account.accessTokenExpiresAt,
				refreshTokenExpiresAt: account.refreshTokenExpiresAt,
				scope: account.scope,
				providerId: account.providerId,
				accountId: userInfo.id.toString(),
			};
			const { user: createdUser, account: createdAccount } =
				await c.context.internalAdapter.createOAuthUser(
					{
						...restUserInfo,
						email: userInfo.email.toLowerCase(),
					},
					accountData,
				);
			user = createdUser;
			if (c.context.options.account?.storeAccountCookie) {
				await setAccountCookie(c, createdAccount);
			}
			if (
				!userInfo.emailVerified &&
				user &&
				c.context.options.emailVerification?.sendOnSignUp &&
				c.context.options.emailVerification?.sendVerificationEmail
			) {
				const token = await createEmailVerificationToken(
					c.context.secret,
					user.email,
					undefined,
					c.context.options.emailVerification?.expiresIn,
				);
				const url = `${c.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
				await c.context.runInBackgroundOrAwait(
					c.context.options.emailVerification.sendVerificationEmail(
						{
							user,
							url,
							token,
						},
						c.request,
					),
				);
			}
		} catch (e: any) {
			logger.error(e);
			if (isAPIError(e)) {
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

	const session = await c.context.internalAdapter.createSession(user.id);
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

/**
 * Handle linking an OAuth account to a specific user (from linkSocial).
 * This is used when the linkUserId is provided, typically through oauth-proxy.
 */
async function handleLinkToUser(
	c: GenericEndpointContext,
	opts: {
		userInfo: Omit<User, "createdAt" | "updatedAt">;
		account: Omit<Account, "id" | "userId" | "createdAt" | "updatedAt">;
		linkUserId: string;
		isTrustedProvider?: boolean | undefined;
	},
) {
	const { userInfo, account, linkUserId, isTrustedProvider } = opts;

	// Find the user to link to
	const targetUser = await c.context.internalAdapter.findUserById(linkUserId);
	if (!targetUser) {
		logger.error("Link target user not found", { linkUserId });
		return {
			error: "user not found",
			data: null,
			isRegister: false,
		};
	}

	// Check if the account is already linked to this user
	const existingAccounts =
		await c.context.internalAdapter.findAccounts(linkUserId);
	const alreadyLinked = existingAccounts.find(
		(a) =>
			a.providerId === account.providerId && a.accountId === account.accountId,
	);

	if (alreadyLinked) {
		// Account is already linked, we return a placeholder session for type consistency.
		// For oauth-proxy link flows, the session cookie is NOT set since the user
		// already has a session from initiating linkSocial. This placeholder is
		// never used; it exists only to satisfy the return type required by other
		// callers (sign-in flows) that do use the session.
		const placeholderSession = {
			id: "link-placeholder",
			userId: targetUser.id,
			token: "link-operation-placeholder",
			expiresAt: new Date(0), // Already expired, cannot be used
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		return {
			data: { session: placeholderSession, user: targetUser },
			error: null,
			isRegister: false,
		};
	}

	// Check if account is already linked to a different user
	const accountLinkedToOther =
		await c.context.internalAdapter.findAccountByProviderId(
			account.accountId,
			account.providerId,
		);
	if (accountLinkedToOther && accountLinkedToOther.userId !== linkUserId) {
		logger.error("Account already linked to a different user");
		return {
			error: "account_already_linked_to_different_user",
			data: null,
			isRegister: false,
		};
	}

	// Verify linking is allowed
	const accountLinking = c.context.options.account?.accountLinking;
	const trusted =
		isTrustedProvider ||
		c.context.trustedProviders.includes(account.providerId);

	if (
		(!trusted && !userInfo.emailVerified) ||
		accountLinking?.enabled === false
	) {
		if (isDevelopment()) {
			logger.warn(
				`Cannot link account from ${account.providerId}: provider not trusted and email not verified, or account linking is disabled.`,
			);
		}
		return {
			error: "account not linked",
			data: null,
			isRegister: false,
		};
	}

	// Check email policy for linking
	if (
		userInfo.email.toLowerCase() !== targetUser.email?.toLowerCase() &&
		c.context.options.account?.accountLinking?.allowDifferentEmails !== true
	) {
		return {
			error: "email doesn't match",
			data: null,
			isRegister: false,
		};
	}

	// Link the account
	try {
		await c.context.internalAdapter.linkAccount({
			providerId: account.providerId,
			accountId: userInfo.id.toString(),
			userId: linkUserId,
			accessToken: await setTokenUtil(account.accessToken, c.context),
			refreshToken: await setTokenUtil(account.refreshToken, c.context),
			idToken: account.idToken,
			accessTokenExpiresAt: account.accessTokenExpiresAt,
			refreshTokenExpiresAt: account.refreshTokenExpiresAt,
			scope: account.scope,
		});
	} catch (e) {
		logger.error("Unable to link account", e);
		return {
			error: "unable to link account",
			data: null,
			isRegister: false,
		};
	}

	// Update emailVerified if needed
	if (
		userInfo.emailVerified &&
		!targetUser.emailVerified &&
		userInfo.email.toLowerCase() === targetUser.email?.toLowerCase()
	) {
		await c.context.internalAdapter.updateUser(targetUser.id, {
			emailVerified: true,
		});
	}

	// Return a placeholder session for type consistency.
	// For oauth-proxy link flows, the session cookie is NOT set since the user
	// already has a session from initiating linkSocial. This placeholder is
	// never used; it exists only to satisfy the return type required by other
	// callers (sign-in flows) that do use the session.
	const placeholderSession = {
		id: "link-placeholder",
		userId: targetUser.id,
		token: "link-operation-placeholder",
		expiresAt: new Date(0), // Already expired - cannot be used
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	return {
		data: { session: placeholderSession, user: targetUser },
		error: null,
		isRegister: false,
	};
}
