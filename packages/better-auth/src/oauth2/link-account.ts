import type {
	GenericEndpointContext,
	UserProvisioningSource,
} from "@better-auth/core";
import { runWithTransaction } from "@better-auth/core/context";
import { isDevelopment } from "@better-auth/core/env";
import { APIError } from "@better-auth/core/error";
import { createEmailVerificationToken } from "../api";
import { setAccountCookie } from "../cookies/session-store";
import { parseAdditionalUserInputFromProviderProfile } from "../db";
import type { Account, User } from "../types";
import { isAPIError } from "../utils/is-api-error";
import { assertValidUserInfo } from "../utils/validate-user-info";
import { OAUTH_CALLBACK_ERROR_CODES, redirectOnError } from "./errors";
import { setTokenUtil } from "./utils";

// TODO(#9124): v2 widens `User.email` to nullable; every `userInfo.email.toLowerCase()`
// call below needs null-safety before account recognition can be fully
// independent from email-based implicit linking.
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
		selectedUser?:
			| {
					userId: string;
					profile: "preserve" | "update";
			  }
			| undefined;
		deferNonDatabaseWrites?: boolean | undefined;
		requireExactAccountBinding?: boolean | undefined;
	},
) {
	const { userInfo, account, callbackURL, disableSignUp, overrideUserInfo } =
		opts;
	const source = opts.source ?? {
		method: "oauth",
		oauth: { providerId: account.providerId },
	};
	const requireExactAccountBinding =
		!!opts.selectedUser || opts.requireExactAccountBinding === true;
	let pendingAccountCookie: Account | null = null;
	const accountOwner = await c.context.internalAdapter
		.findAccountOwnerByKey({
			issuer: account.issuer,
			providerAccountId: account.providerAccountId,
		})
		.catch((e) => {
			c.context.logger.error(
				"Better auth was unable to query your database.\nError: ",
				e,
			);
			const errorURL =
				c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
			redirectOnError(c, errorURL, "internal_server_error");
		});
	if (accountOwner?.kind === "orphaned") {
		c.context.logger.error(
			"OAuth account references a missing user. Repair the account before retrying authentication.",
		);
		return {
			error: "unable to link account",
			data: null,
			isRegister: false,
		};
	}
	const dbUser = await (async () => {
		if (accountOwner?.kind === "owned") {
			if (
				opts.selectedUser &&
				accountOwner.user.id !== opts.selectedUser.userId
			) {
				throw new APIError("CONFLICT", {
					code: "account_ownership_conflict",
					message: "Account is already linked to another user",
				});
			}
			if (
				requireExactAccountBinding &&
				accountOwner.account.providerId !== account.providerId
			) {
				throw new APIError("CONFLICT", {
					code: "account_provider_conflict",
					message: "Account is already linked through another provider",
				});
			}
			return {
				user: accountOwner.user,
				linkedAccount: accountOwner.account,
				accounts: [accountOwner.account],
			};
		}
		if (opts.selectedUser) {
			const selectedUser = await c.context.internalAdapter.findUserById(
				opts.selectedUser.userId,
			);
			if (!selectedUser) {
				throw new APIError("NOT_FOUND", {
					code: "user_not_found",
					message: "User not found",
				});
			}
			return {
				user: selectedUser,
				linkedAccount: null,
				accounts: [],
			};
		}

		const emailMatch = await c.context.internalAdapter.findUserByEmail(
			userInfo.email.toLowerCase(),
			{ includeAccounts: true },
		);
		if (!emailMatch) return null;
		return {
			user: emailMatch.user,
			linkedAccount: null,
			accounts: emailMatch.accounts,
		};
	})().catch((e) => {
		if (isAPIError(e)) throw e;
		c.context.logger.error(
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
					acc.issuer === account.issuer &&
					acc.providerAccountId === account.providerAccountId,
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
				!opts.selectedUser &&
				((!isTrustedProvider && !userInfo.emailVerified) ||
					(requireLocalEmailVerified && !dbUser.user.emailVerified) ||
					accountLinking?.enabled === false ||
					accountLinking?.disableImplicitLinking === true)
			) {
				if (isDevelopment()) {
					c.context.logger.warn(
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
				const createdAccount = await c.context.internalAdapter.linkAccount({
					providerId: account.providerId,
					issuer: account.issuer,
					providerAccountId: account.providerAccountId,
					userId: dbUser.user.id,
					accessToken: await setTokenUtil(account.accessToken, c.context),
					refreshToken: await setTokenUtil(account.refreshToken, c.context),
					idToken: account.idToken,
					accessTokenExpiresAt: account.accessTokenExpiresAt,
					refreshTokenExpiresAt: account.refreshTokenExpiresAt,
					scope: account.scope,
				});
				if (!createdAccount) {
					return {
						error: "unable to link account",
						data: null,
					};
				}
				if (
					requireExactAccountBinding &&
					(createdAccount.issuer !== account.issuer ||
						createdAccount.providerAccountId !== account.providerAccountId ||
						createdAccount.providerId !== account.providerId ||
						createdAccount.userId !== dbUser.user.id)
				) {
					throw new APIError("CONFLICT", {
						code: "account_hook_binding_conflict",
						message: "Account hook changed the selected authentication binding",
					});
				}
				if (c.context.options.account?.storeAccountCookie) {
					if (opts.deferNonDatabaseWrites)
						pendingAccountCookie = createdAccount;
					else await setAccountCookie(c, createdAccount);
				}
			} catch (e) {
				if (isAPIError(e)) {
					throw e;
				}
				c.context.logger.error("Unable to link account", e);
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
				!opts.selectedUser &&
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			) {
				await c.context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
			}

			if (!opts.selectedUser) {
				user =
					(await applyUpdateUserInfoOnLink(c, dbUser.user.id, userInfo)) ??
					user;
			}
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

			/**
			 * `scope` intentionally omitted. Updated only via linkSocial.
			 *
			 * @see {@link Account.scope}
			 */
			const freshTokens =
				c.context.options.account?.updateAccountOnSignIn !== false
					? Object.fromEntries(
							Object.entries({
								providerId: account.providerId,
								idToken: account.idToken,
								accessToken: await setTokenUtil(account.accessToken, c.context),
								refreshToken: await setTokenUtil(
									account.refreshToken,
									c.context,
								),
								accessTokenExpiresAt: account.accessTokenExpiresAt,
								refreshTokenExpiresAt: account.refreshTokenExpiresAt,
							}).filter(([_, value]) => value !== undefined),
						)
					: {};

			if (c.context.options.account?.storeAccountCookie) {
				const accountCookie = {
					...linkedAccount,
					...freshTokens,
				};
				if (opts.deferNonDatabaseWrites) pendingAccountCookie = accountCookie;
				else await setAccountCookie(c, accountCookie);
			}

			if (Object.keys(freshTokens).length > 0) {
				const updatedAccount = await c.context.internalAdapter.updateAccount(
					linkedAccount.id,
					freshTokens,
				);
				if (!updatedAccount) {
					return {
						error: "unable to update account",
						data: null,
					};
				}
				if (
					requireExactAccountBinding &&
					(updatedAccount.issuer !== account.issuer ||
						updatedAccount.providerAccountId !== account.providerAccountId ||
						updatedAccount.providerId !== account.providerId ||
						updatedAccount.userId !== dbUser.user.id)
				) {
					throw new APIError("CONFLICT", {
						code: "account_hook_binding_conflict",
						message: "Account hook changed the selected authentication binding",
					});
				}
				if (opts.deferNonDatabaseWrites && pendingAccountCookie) {
					pendingAccountCookie = updatedAccount;
				}
			}

			if (
				!opts.selectedUser &&
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			) {
				await c.context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
			}
		}
		if (
			opts.selectedUser
				? opts.selectedUser.profile === "update"
				: overrideUserInfo
		) {
			const {
				id: _id,
				email: _email,
				emailVerified: _emailVerified,
				name,
				image,
				...providerProfile
			} = userInfo;
			const additionalUserFields = parseAdditionalUserInputFromProviderProfile(
				c.context.options,
				providerProfile,
				"update",
			);
			// update user info from the provider if overrideUserInfo is true
			const updatedUser = await c.context.internalAdapter.updateUser(
				dbUser.user.id,
				{
					name,
					image,
					...additionalUserFields,
					email: userInfo.email.toLowerCase(),
					emailVerified:
						userInfo.email.toLowerCase() === dbUser.user.email
							? dbUser.user.emailVerified || userInfo.emailVerified
							: userInfo.emailVerified,
				},
			);
			if (updatedUser == null) {
				c.context.logger.warn(
					"Could not update user info during OAuth sign in; preserving existing user for session.",
				);
			}
			if (
				opts.selectedUser &&
				updatedUser &&
				updatedUser.id !== opts.selectedUser.userId
			) {
				throw new APIError("CONFLICT", {
					code: "user_hook_selection_conflict",
					message: "User hook changed the selected user",
				});
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
			const {
				id: _id,
				email: _email,
				emailVerified: _emailVerified,
				name,
				image,
				...providerProfile
			} = userInfo;
			const additionalUserFields = parseAdditionalUserInputFromProviderProfile(
				c.context.options,
				providerProfile,
				"create",
			);
			const accountData = {
				accessToken: await setTokenUtil(account.accessToken, c.context),
				refreshToken: await setTokenUtil(account.refreshToken, c.context),
				idToken: account.idToken,
				accessTokenExpiresAt: account.accessTokenExpiresAt,
				refreshTokenExpiresAt: account.refreshTokenExpiresAt,
				scope: account.scope,
				providerId: account.providerId,
				issuer: account.issuer,
				providerAccountId: account.providerAccountId,
			};
			const { createdUser, createdAccount } = await runWithTransaction(
				c.context.adapter,
				async () => {
					const createdUser = await c.context.internalAdapter.createUser(
						{
							name,
							image,
							...additionalUserFields,
							email: userInfo.email.toLowerCase(),
							emailVerified: userInfo.emailVerified,
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
			if (
				requireExactAccountBinding &&
				(createdAccount.issuer !== account.issuer ||
					createdAccount.providerAccountId !== account.providerAccountId ||
					createdAccount.providerId !== account.providerId ||
					createdAccount.userId !== createdUser.id)
			) {
				throw new APIError("CONFLICT", {
					code: "account_hook_binding_conflict",
					message: "Account hook changed the selected authentication binding",
				});
			}
			user = createdUser;
			if (c.context.options.account?.storeAccountCookie) {
				if (opts.deferNonDatabaseWrites) pendingAccountCookie = createdAccount;
				else await setAccountCookie(c, createdAccount);
			}
		} catch (e) {
			if (isAPIError(e)) {
				throw e;
			}
			c.context.logger.error("Unable to create OAuth user", e);
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

	const session = await c.context.internalAdapter.createSession(
		user.id,
		undefined,
		undefined,
		undefined,
		{ deferSecondaryStorageWrites: opts.deferNonDatabaseWrites === true },
	);
	if (!session) {
		return {
			error: "unable to create session",
			data: null,
			isRegister: false,
		};
	}
	if (
		requireExactAccountBinding &&
		session.userId !== (opts.selectedUser?.userId ?? user.id)
	) {
		throw new APIError("CONFLICT", {
			code: "session_hook_user_conflict",
			message: "Session hook changed the selected user",
		});
	}

	return {
		data: {
			session,
			user,
		},
		error: null,
		isRegister,
		accountCookie: pendingAccountCookie,
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
 * `email` and `emailVerified` are identity anchors and are stripped before
 * the remaining fields are written. Provider identity is resolved separately
 * from the raw profile through the provider's account-key contract.
 */
type LinkedProviderProfile = {
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
	try {
		const {
			email: _email,
			emailVerified: _emailVerified,
			name,
			image,
			...providerProfile
		} = userInfo;
		const additionalUserFields = parseAdditionalUserInputFromProviderProfile(
			c.context.options,
			providerProfile,
			"update",
		);
		return await c.context.internalAdapter.updateUser(userId, {
			name,
			image,
			...additionalUserFields,
		});
	} catch (e) {
		c.context.logger.warn("Could not update user info on account link", e);
		return undefined;
	}
}
