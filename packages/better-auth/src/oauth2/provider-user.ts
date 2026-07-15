import type {
	AuthenticatedProviderAccountBinding,
	GenericEndpointContext,
	UserProvisioningSource,
} from "@better-auth/core";
import type { IdentityKey } from "@better-auth/core/db";
import { isDevelopment } from "@better-auth/core/env";
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
export async function authenticateProviderUser(
	c: GenericEndpointContext,
	opts: {
		userInfo: Omit<User, "createdAt" | "updatedAt">;
		identity: IdentityKey;
		account: Pick<
			Account,
			| "providerId"
			| "providerInstanceId"
			| "accessToken"
			| "refreshToken"
			| "idToken"
			| "accessTokenExpiresAt"
			| "refreshTokenExpiresAt"
			| "scope"
		>;
		callbackURL?: string | undefined;
		disableSignUp?: boolean | undefined;
		overrideUserInfo?: boolean | undefined;
		isTrustedProvider?: boolean | undefined;
		trustProviderByName?: boolean | undefined;
		source?: UserProvisioningSource | undefined;
	},
) {
	const {
		userInfo,
		identity,
		account,
		callbackURL,
		disableSignUp,
		overrideUserInfo,
	} = opts;
	const source = opts.source ?? {
		method: "oauth",
		oauth: { providerId: account.providerId },
	};
	let authenticatedProviderAccountBinding:
		| AuthenticatedProviderAccountBinding
		| undefined;
	const identityOwner = await c.context.internalAdapter
		.findIdentityOwnerByKey(identity)
		.catch((e) => {
			c.context.logger.error(
				"Better auth was unable to query your database.\nError: ",
				e,
			);
			const errorURL =
				c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
			redirectOnError(c, errorURL, "internal_server_error");
		});
	if (identityOwner?.kind === "orphaned") {
		c.context.logger.error(
			"OAuth identity references a missing user. Repair the identity before retrying authentication.",
		);
		return { error: "unable to link account", data: null };
	}
	const dbUser = await (async () => {
		if (identityOwner?.kind === "owned") {
			const linkedAccount = await c.context.internalAdapter.findAccountByKey({
				identityId: identityOwner.identity.id,
				providerInstanceId: account.providerInstanceId,
			});
			return {
				user: identityOwner.user,
				identity: identityOwner.identity,
				linkedAccount,
				matchedByIdentity: true,
			};
		}

		const emailMatch = await c.context.internalAdapter.findUserByEmail(
			userInfo.email.toLowerCase(),
			{ includeAccounts: false },
		);
		if (!emailMatch) return null;
		return {
			user: emailMatch.user,
			identity: null,
			linkedAccount: null,
			matchedByIdentity: false,
		};
	})().catch((e) => {
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
		const linkedAccount = dbUser.linkedAccount;
		if (!linkedAccount) {
			const accountLinking = c.context.options.account?.accountLinking;
			const isTrustedProvider =
				opts.isTrustedProvider ||
				(opts.trustProviderByName !== false &&
					c.context.trustedProviders.includes(account.providerId));
			const implicitLinkingRejected =
				!dbUser.matchedByIdentity &&
				((!isTrustedProvider && !userInfo.emailVerified) ||
					!dbUser.user.emailVerified ||
					accountLinking?.enabled === false ||
					accountLinking?.disableImplicitLinking === true);
			if (implicitLinkingRejected) {
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
				const linked = await c.context.internalAdapter.linkAccount(
					dbUser.user.id,
					identity,
					{
						providerId: account.providerId,
						providerInstanceId: account.providerInstanceId,
						accessToken: await setTokenUtil(account.accessToken, c.context),
						refreshToken: await setTokenUtil(account.refreshToken, c.context),
						idToken: account.idToken,
						accessTokenExpiresAt: account.accessTokenExpiresAt,
						refreshTokenExpiresAt: account.refreshTokenExpiresAt,
						scope: account.scope,
					},
				);
				if (c.context.options.account?.storeAccountCookie) {
					authenticatedProviderAccountBinding = await setAccountCookie(
						c,
						linked,
					);
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

			/**
			 * `scope` intentionally omitted. Updated only via linkSocial.
			 *
			 * @see {@link Account.scope}
			 */
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
							}).filter(([_, value]) => value !== undefined),
						)
					: {};

			if (c.context.options.account?.storeAccountCookie && dbUser.identity) {
				authenticatedProviderAccountBinding = await setAccountCookie(c, {
					account: {
						...linkedAccount,
						...freshTokens,
					},
					identity: dbUser.identity,
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
				providerInstanceId: account.providerInstanceId,
			};
			const created = await c.context.internalAdapter.createUserWithAccount(
				{
					name,
					image,
					...additionalUserFields,
					email: userInfo.email.toLowerCase(),
					emailVerified: userInfo.emailVerified,
				},
				{
					source,
					buildAuthentication: () => ({
						identity,
						account: accountData,
					}),
				},
			);
			user = created.user;
			if (c.context.options.account?.storeAccountCookie) {
				authenticatedProviderAccountBinding = await setAccountCookie(c, {
					account: created.account,
					identity: created.identity,
				});
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
			authenticatedProviderAccountBinding,
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
 * `email` and `emailVerified` are identity anchors and are stripped before
 * the remaining fields are written. Provider identity is resolved separately
 * from the raw profile through the provider's identity-key contract.
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
