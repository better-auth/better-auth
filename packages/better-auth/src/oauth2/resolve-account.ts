import type {
	GenericEndpointContext,
	UserProvisioningSource,
} from "@better-auth/core";
import { isDevelopment, logger } from "@better-auth/core/env";
import type { Account, User } from "../types";
import { isAPIError } from "../utils/is-api-error";

/**
 * Policy a caller hands {@link resolveOAuthUser} to gate implicit account
 * linking. The trust/email guards legitimately differ per flow, so they live at
 * the call site, not inside the resolver.
 */
export interface OAuthLinkPolicy {
	/**
	 * Whether the provider is trusted. When `true`, an unverified provider email
	 * does not block linking. Defaults to membership in
	 * `c.context.trustedProviders`.
	 */
	isTrustedProvider?: boolean | undefined;
	/**
	 * Whether `providerId` may be matched against the configured
	 * `trustedProviders` list to infer trust. Defaults to `true` for built-in
	 * social/OAuth providers, whose `providerId` namespace is controlled by the
	 * developer's config. Callers whose `providerId` is user-controlled (the SSO
	 * plugin, where any authenticated user can register a provider with an
	 * arbitrary id) must pass `false` so a provider named after a trusted social
	 * provider can't launder that trust; they supply their own
	 * `isTrustedProvider` signal instead.
	 */
	trustProviderByName?: boolean | undefined;
	/** Disable sign-up: error out instead of creating a new user. */
	disableSignUp?: boolean | undefined;
	/**
	 * Overwrite the local user's profile with the provider's on every sign-in
	 * (not just on link).
	 */
	overrideUserInfo?: boolean | undefined;
}

export interface ResolveOAuthUserParams {
	userInfo: Omit<User, "createdAt" | "updatedAt">;
	providerId: string;
	linkPolicy: OAuthLinkPolicy;
	/**
	 * Authentication source metadata forwarded to the `validateUserInfo`
	 * provisioning gate when a new user is created here.
	 */
	source: UserProvisioningSource;
}

/**
 * The resolved identity for an OAuth sign-in or implicit link.
 *
 * `linkedAccount` is the existing account row when the identity was already
 * linked, otherwise `null` (a fresh link or a brand-new user). Callers use it
 * to choose the persist `mode` and skip redundant work.
 */
export interface ResolvedOAuthUser {
	user: User;
	isRegister: boolean;
	linkedAccount: Account | null;
	error: null;
}

export interface ResolveOAuthUserError {
	error: string;
	user: null;
}

/**
 * Owns OAuth user resolution: looks up the identity, applies the
 * account-linking policy gate (trusted provider, `requireLocalEmailVerified`,
 * `accountLinking.enabled`/`disableImplicitLinking`), promotes a verified
 * provider email onto an unverified local row, applies `updateUserInfoOnLink`
 * and `overrideUserInfo`, and creates the user on first sign-in.
 *
 * It never touches the account's tokens or grant: that is
 * {@link persistOAuthAccount}'s sole responsibility. On success the caller
 * persists the account, then issues the session.
 *
 * @returns the resolved user (with `isRegister` and any existing
 * `linkedAccount`), or a structured error with a stable code.
 */
export async function resolveOAuthUser(
	c: GenericEndpointContext,
	params: ResolveOAuthUserParams,
): Promise<ResolvedOAuthUser | ResolveOAuthUserError> {
	const { userInfo, providerId, linkPolicy, source } = params;

	let dbUser: Awaited<
		ReturnType<typeof c.context.internalAdapter.findOAuthUser>
	>;
	try {
		dbUser = await c.context.internalAdapter.findOAuthUser(
			userInfo.email.toLowerCase(),
			userInfo.id,
			providerId,
		);
	} catch (e) {
		// A failed lookup must abort the flow. Treating a transient DB error as
		// "no user found" would fall through to sign-up and create a duplicate
		// user/account, bypassing the existing-account checks.
		logger.error("Better auth was unable to query your database.\nError: ", e);
		return { error: "unable to query database", user: null };
	}

	if (!dbUser?.user) {
		if (linkPolicy.disableSignUp) {
			return { error: "signup disabled", user: null };
		}
		try {
			const { id: _id, ...restUserInfo } = userInfo;
			const createdUser = await c.context.internalAdapter.createUser(
				{
					...restUserInfo,
					email: userInfo.email.toLowerCase(),
				},
				source,
			);
			return {
				user: createdUser,
				isRegister: true,
				linkedAccount: null,
				error: null,
			};
		} catch (e) {
			// Re-throw APIErrors to preserve the machine-readable code; only opaque
			// failures fall through to the generic error return.
			if (isAPIError(e)) {
				throw e;
			}
			logger.error("Unable to create user", e);
			return { error: "unable to create user", user: null };
		}
	}

	let user = dbUser.user;
	const linkedAccount =
		dbUser.linkedAccount ??
		dbUser.accounts.find(
			(acc) => acc.providerId === providerId && acc.accountId === userInfo.id,
		) ??
		null;

	if (!linkedAccount) {
		const gate = canLinkImplicitly(c, {
			providerId,
			providerEmailVerified: userInfo.emailVerified,
			localEmailVerified: dbUser.user.emailVerified,
			isTrustedProvider: linkPolicy.isTrustedProvider,
			trustProviderByName: linkPolicy.trustProviderByName,
		});
		if (!gate) {
			if (isDevelopment()) {
				logger.warn(
					`User already exist but account isn't linked to ${providerId}. To read more about how account linking works in Better Auth see https://www.better-auth.com/docs/concepts/users-accounts#account-linking.`,
				);
			}
			return { error: "account not linked", user: null };
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
			user =
				(await c.context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				})) ?? user;
		}

		user =
			(await applyUpdateUserInfoOnLink(c, dbUser.user.id, userInfo)) ?? user;
	} else if (
		userInfo.emailVerified &&
		!dbUser.user.emailVerified &&
		userInfo.email.toLowerCase() === dbUser.user.email
	) {
		user =
			(await c.context.internalAdapter.updateUser(dbUser.user.id, {
				emailVerified: true,
			})) ?? user;
	}

	if (linkPolicy.overrideUserInfo) {
		const { id: _id, ...restUserInfo } = userInfo;
		user =
			(await c.context.internalAdapter.updateUser(dbUser.user.id, {
				...restUserInfo,
				email: userInfo.email.toLowerCase(),
				emailVerified:
					userInfo.email.toLowerCase() === dbUser.user.email
						? dbUser.user.emailVerified || userInfo.emailVerified
						: userInfo.emailVerified,
			})) ?? user;
	}

	return {
		user,
		isRegister: false,
		linkedAccount,
		error: null,
	};
}

/**
 * The implicit account-linking gate (RFC-agnostic policy). Linking proceeds
 * only when the provider's email is trusted (trusted provider or a verified
 * provider email), the local row is verified unless
 * `requireLocalEmailVerified` is opted out, and account linking is not
 * disabled.
 *
 * @see https://www.better-auth.com/docs/concepts/users-accounts#account-linking
 */
export function canLinkImplicitly(
	c: GenericEndpointContext,
	opts: {
		providerId: string;
		providerEmailVerified: boolean;
		localEmailVerified: boolean;
		isTrustedProvider?: boolean | undefined;
		/**
		 * Whether `providerId` may be matched against the configured
		 * `trustedProviders` list to infer trust. Defaults to `true`; SSO callers
		 * with user-controlled `providerId` pass `false`.
		 */
		trustProviderByName?: boolean | undefined;
	},
): boolean {
	const accountLinking = c.context.options.account?.accountLinking;
	const isTrustedProvider =
		opts.isTrustedProvider ||
		(opts.trustProviderByName !== false &&
			c.context.trustedProviders.includes(opts.providerId));
	// FIXME(next-minor): drop `requireLocalEmailVerified` option and make the
	// gate unconditional.
	const requireLocalEmailVerified =
		accountLinking?.requireLocalEmailVerified ?? true;
	if (
		(!isTrustedProvider && !opts.providerEmailVerified) ||
		(requireLocalEmailVerified && !opts.localEmailVerified) ||
		accountLinking?.enabled === false ||
		accountLinking?.disableImplicitLinking === true
	) {
		return false;
	}
	return true;
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
