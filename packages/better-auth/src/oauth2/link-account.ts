import type { GenericEndpointContext } from "@better-auth/core";
import { isDevelopment } from "@better-auth/core/env";
import { createEmailVerificationToken } from "../api";
import { setAccountCookie } from "../cookies/session-store";
import { parseAdditionalUserInputFromProviderProfile } from "../db";
import type { Account, User } from "../types";
import { isAPIError } from "../utils/is-api-error";
import { redirectOnError } from "./errors";
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
		/**
		 * Email of the user at the time linkSocial was initiated.
		 * Used for email policy validation in proxy-based link flows,
		 * consistent with the standard linkSocial callback which validates
		 * against the email captured at flow start.
		 */
		linkEmail?: string | undefined;
		/**
		 * Whether `account.providerId` may be matched against the globally
		 * configured `accountLinking.trustedProviders` list to infer trust.
		 *
		 * Defaults to `true` for built-in social/OAuth providers, whose
		 * `providerId` namespace is controlled by the developer's config. Callers
		 * whose `providerId` is user-controlled (e.g. the SSO plugin, where any
		 * authenticated user can register a provider with an arbitrary id) must
		 * pass `false` so a provider named after a trusted social provider can't
		 * launder that trust. Such callers should supply their own
		 * `isTrustedProvider` signal instead.
		 */
		trustProviderByName?: boolean | undefined;
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

	if (linkUserId) {
		return handleLinkToUser(c, {
			userInfo,
			account,
			linkUserId,
			linkEmail: opts.linkEmail,
			isTrustedProvider: opts.isTrustedProvider,
			trustProviderByName: opts.trustProviderByName,
		});
	}

	const dbUser = await c.context.internalAdapter
		.findOAuthUser(
			userInfo.email.toLowerCase(),
			account.accountId,
			account.providerId,
		)
		.catch((e) => {
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
					c.context.logger.warn(
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
				c.context.logger.error("Unable to link account", e);
				return {
					error: "unable to link account",
					data: null,
					isRegister: false,
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
			user = await c.context.internalAdapter.updateUser(dbUser.user.id, {
				name,
				image,
				...additionalUserFields,
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
				accountId: userInfo.id.toString(),
			};
			const { user: createdUser, account: createdAccount } =
				await c.context.internalAdapter.createOAuthUser(
					{
						name,
						image,
						...additionalUserFields,
						email: userInfo.email.toLowerCase(),
						emailVerified: userInfo.emailVerified,
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
				const url = `${c.context.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent(
					callbackURL || "/",
				)}`;
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
			c.context.logger.error(e);
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
 * Expired placeholder session returned by link operations for type
 * consistency. The oauth-proxy callback skips `setSessionCookie` for link
 * flows, so this value is never persisted or sent to the client.
 */
function createLinkPlaceholderSession(userId: string) {
	return {
		id: "link-placeholder",
		userId,
		token: "link-operation-placeholder",
		expiresAt: new Date(0),
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

/**
 * Handle linking an OAuth account to a specific user (from linkSocial).
 * Used when the linkUserId is provided, typically through oauth-proxy.
 */
async function handleLinkToUser(
	c: GenericEndpointContext,
	opts: {
		userInfo: Omit<User, "createdAt" | "updatedAt">;
		account: Omit<Account, "id" | "userId" | "createdAt" | "updatedAt">;
		linkUserId: string;
		linkEmail?: string | undefined;
		isTrustedProvider?: boolean | undefined;
		trustProviderByName?: boolean | undefined;
	},
) {
	const { userInfo, account, linkUserId, linkEmail } = opts;

	const targetUser = await c.context.internalAdapter.findUserById(linkUserId);
	if (!targetUser) {
		logger.error("Link target user not found", { linkUserId });
		return {
			error: "user not found",
			data: null,
			isRegister: false,
		};
	}

	const existingAccounts =
		await c.context.internalAdapter.findAccounts(linkUserId);
	const alreadyLinked = existingAccounts.find(
		(a) =>
			a.providerId === account.providerId && a.accountId === account.accountId,
	);

	if (alreadyLinked) {
		// Refresh stored OAuth tokens/scopes, matching the direct callback behavior.
		const freshTokens = Object.fromEntries(
			Object.entries({
				accessToken: await setTokenUtil(account.accessToken, c.context),
				refreshToken: await setTokenUtil(account.refreshToken, c.context),
				idToken: account.idToken,
				accessTokenExpiresAt: account.accessTokenExpiresAt,
				refreshTokenExpiresAt: account.refreshTokenExpiresAt,
				scope: account.scope,
			}).filter(([_, value]) => value !== undefined),
		);
		if (Object.keys(freshTokens).length > 0) {
			await c.context.internalAdapter.updateAccount(
				alreadyLinked.id,
				freshTokens,
			);
		}

		return {
			data: {
				session: createLinkPlaceholderSession(targetUser.id),
				user: targetUser,
			},
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

	const accountLinking = c.context.options.account?.accountLinking;
	const trusted =
		opts.isTrustedProvider ||
		(opts.trustProviderByName !== false &&
			c.context.trustedProviders.includes(account.providerId));

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

	// Compare against the email captured at flow start for consistency
	// with the standard linkSocial callback.
	const referenceEmail = linkEmail || targetUser.email;
	if (
		userInfo.email.toLowerCase() !== referenceEmail?.toLowerCase() &&
		c.context.options.account?.accountLinking?.allowDifferentEmails !== true
	) {
		return {
			error: "email doesn't match",
			data: null,
			isRegister: false,
		};
	}

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

	if (
		userInfo.emailVerified &&
		!targetUser.emailVerified &&
		userInfo.email.toLowerCase() === targetUser.email?.toLowerCase()
	) {
		await c.context.internalAdapter.updateUser(targetUser.id, {
			emailVerified: true,
		});
	}

	const user =
		(await applyUpdateUserInfoOnLink(c, targetUser.id, userInfo)) ?? targetUser;

	return {
		data: {
			session: createLinkPlaceholderSession(targetUser.id),
			user,
		},
		error: null,
		isRegister: false,
	};
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
