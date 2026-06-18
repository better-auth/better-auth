import type {
	GenericEndpointContext,
	UserProvisioningSource,
} from "@better-auth/core";
import { runWithTransaction } from "@better-auth/core/context";
import { isDevelopment, logger } from "@better-auth/core/env";
import { createEmailVerificationToken } from "../api";
import { setAccountCookie } from "../cookies/session-store";
import type { Account, User } from "../types";
import { isAPIError } from "../utils/is-api-error";
import { assertValidUserInfo } from "../utils/validate-user-info";
import { OAUTH_CALLBACK_ERROR_CODES, redirectOnError } from "./errors";
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
		trustProviderByName?: boolean | undefined;
		source?: UserProvisioningSource | undefined;
	},
) {
	const { userInfo, account, callbackURL, disableSignUp, overrideUserInfo } =
		opts;
	const source = opts.source ?? {
		method: "oauth",
		oauth: { providerId: account.providerId },
	};
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
			redirectOnError(c, errorURL, "internal_server_error");
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
				(opts.trustProviderByName !== false &&
					c.context.trustedProviders.includes(account.providerId));
			// FIXME(next-minor): drop `requireLocalEmailVerified` option and make
			// the gate unconditional.
			const requireLocalEmailVerified =
				accountLinking?.requireLocalEmailVerified ?? true;
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				(requireLocalEmailVerified && !dbUser.user.emailVerified) ||
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
				};
			}
			try {
				const { id: _providerAccountId, ...providerUserInfo } = userInfo;
				await assertValidUserInfo(c, {
					user: {
						...providerUserInfo,
						id: dbUser.user.id,
						email: userInfo.email.toLowerCase(),
					},
					source: { ...source, action: "link-account" },
				});
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
				if (isAPIError(e)) {
					throw e;
				}
				logger.error("Unable to link account", e);
				return {
					error: "unable to link account",
					data: null,
				};
			}

			// Reachable only when `requireLocalEmailVerified: false` lets the link
			// proceed for an unverified local row. The IdP's verified email is
			// promoted to the local row so subsequent flows treat it as verified.
			// FIXME(next-minor): unreachable once the gate becomes unconditional.
			if (
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			) {
				await c.context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
			}

			user =
				(await applyUpdateUserInfoOnLink(c, dbUser.user.id, userInfo)) ?? user;
		} else {
			const { id: _providerAccountId, ...providerUserInfo } = userInfo;
			await assertValidUserInfo(c, {
				user: {
					...providerUserInfo,
					id: dbUser.user.id,
					email: userInfo.email.toLowerCase(),
				},
				source: { ...source, action: "sign-in" },
			});

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
			const updatedUser = await c.context.internalAdapter.updateUser(
				dbUser.user.id,
				{
					...restUserInfo,
					email: userInfo.email.toLowerCase(),
					emailVerified:
						userInfo.email.toLowerCase() === dbUser.user.email
							? dbUser.user.emailVerified || userInfo.emailVerified
							: userInfo.emailVerified,
				},
			);
			if (updatedUser == null) {
				logger.warn(
					"Could not update user info during OAuth sign in; preserving existing user for session.",
				);
			}
			user = updatedUser ?? user;
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
			const { createdUser, createdAccount } = await runWithTransaction(
				c.context.adapter,
				async () => {
					const createdUser = await c.context.internalAdapter.createUser(
						{
							...restUserInfo,
							email: userInfo.email.toLowerCase(),
						},
						source,
					);
					const createdAccount = await c.context.internalAdapter.createAccount({
						...accountData,
						userId: createdUser.id,
					});
					return { createdUser, createdAccount };
				},
			);
			user = createdUser;
			if (c.context.options.account?.storeAccountCookie) {
				await setAccountCookie(c, createdAccount);
			}
		} catch (e) {
			if (isAPIError(e)) {
				throw e;
			}
			logger.error("Unable to create OAuth user", e);
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

	const requireEmailVerification = c.context.socialProviders.find(
		(p) => p.id === account.providerId,
	)?.options?.requireEmailVerification;

	if (
		isRegister &&
		!user.emailVerified &&
		(c.context.options.emailVerification?.sendOnSignUp ??
			requireEmailVerification)
	) {
		await dispatchVerificationEmail(c, user, callbackURL);
	}

	if (requireEmailVerification && !user.emailVerified) {
		if (!isRegister && c.context.options.emailVerification?.sendOnSignIn) {
			await dispatchVerificationEmail(c, user, callbackURL);
		}
		return {
			error: OAUTH_CALLBACK_ERROR_CODES.EMAIL_NOT_VERIFIED,
			data: null,
			isRegister,
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

async function dispatchVerificationEmail(
	c: GenericEndpointContext,
	user: User,
	callbackURL: string | undefined,
) {
	const sendVerificationEmail =
		c.context.options.emailVerification?.sendVerificationEmail;
	if (!sendVerificationEmail) {
		return;
	}
	try {
		const token = await createEmailVerificationToken(
			c.context.secret,
			user.email,
			undefined,
			c.context.options.emailVerification?.expiresIn,
		);
		const url = `${c.context.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent(
			callbackURL || "/",
		)}`;
		await c.context.runInBackgroundOrAwait(
			sendVerificationEmail(
				{
					user,
					url,
					token,
				},
				c.request,
			),
		);
	} catch (e) {
		c.context.logger.error("Failed to send OAuth verification email", e);
	}
}

/**
 * Provider profile a freshly linked account may copy onto the local user.
 * `id` is the provider's account id (never the local user id), and `email`/
 * `emailVerified` are identity anchors; all three are stripped before the
 * remaining fields are written.
 */
type LinkedProviderProfile = {
	id: string | number;
	name?: string | undefined;
	email?: string | null | undefined;
	emailVerified?: boolean | undefined;
	image?: string | null | undefined;
};

/**
 * Apply the `account.accountLinking.updateUserInfoOnLink` policy: when enabled,
 * copy the freshly linked provider's profile onto the local user, matching the
 * field set persisted on sign-up. The local `email` and `emailVerified` are
 * never changed, so a link can't rebind the account's identity, and
 * `updateUser` drops `undefined` fields, so a provider that omits one leaves
 * the existing column intact.
 *
 * Returns the updated user so a caller that issues a session can seed the
 * cookie cache with the fresh row. Returns `undefined` when the policy is
 * disabled or the update fails: a failed profile sync must not abort the link.
 */
export async function applyUpdateUserInfoOnLink(
	c: GenericEndpointContext,
	userId: string,
	userInfo: LinkedProviderProfile,
): Promise<User | undefined> {
	if (
		c.context.options.account?.accountLinking?.updateUserInfoOnLink !== true
	) {
		return undefined;
	}
	const {
		id: _id,
		email: _email,
		emailVerified: _emailVerified,
		...profile
	} = userInfo;
	try {
		return await c.context.internalAdapter.updateUser(userId, profile);
	} catch (e) {
		c.context.logger.warn("Could not update user info on account link", e);
		return undefined;
	}
}
