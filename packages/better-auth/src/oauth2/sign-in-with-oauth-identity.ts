import type { GenericEndpointContext } from "@better-auth/core";
import { runWithTransaction } from "@better-auth/core/context";
import type {
	OAuth2Tokens,
	ProviderGrantAuthority,
} from "@better-auth/core/oauth2";
import { createEmailVerificationToken } from "../api";
import type { User } from "../types";
import { isAPIError } from "../utils/is-api-error";
import { assertValidUserInfo } from "../utils/validate-user-info";
import { persistOAuthAccount } from "./persist-account";
import type {
	ResolvedOAuthUser,
	ResolveOAuthUserError,
} from "./resolve-account";
import { resolveOAuthUser } from "./resolve-account";

// TODO(#9124): v2 widens `User.email` to nullable; every `userInfo.email.toLowerCase()`
// call below needs null-safety, and `findOAuthUser` must accept a nullable email.

/**
 * Resolve an OAuth identity into a local session: resolve-or-create the user,
 * persist the provider account's tokens and granted scopes through the single
 * write seam, then issue a session and (for a brand-new user) the
 * verification email.
 *
 * Composes {@link resolveOAuthUser} (identity + linking policy) and
 * {@link persistOAuthAccount} (token encryption + grant accumulation), so no
 * caller re-implements either. Callers pass tokens in plaintext and the
 * effective `requestedScopes`; the seam owns encryption and the RFC 6749 §5.1
 * scope fallback.
 */
export async function signInWithOAuthIdentity(
	c: GenericEndpointContext,
	opts: {
		userInfo: Omit<User, "createdAt" | "updatedAt">;
		providerId: string;
		accountId: string;
		tokens: OAuth2Tokens;
		requestedScopes?: string[] | undefined;
		callbackURL?: string | undefined;
		disableSignUp?: boolean | undefined;
		overrideUserInfo?: boolean | undefined;
		isTrustedProvider?: boolean | undefined;
		/**
		 * The raw, unmapped provider profile. Forwarded to the
		 * `validateUserInfo` provisioning gate when this sign-in creates a user.
		 */
		sourceProfile?: Record<string, unknown> | undefined;
		/**
		 * The provider's declared {@link GrantAuthority}; `"full-grant"` lets a
		 * non-empty echo replace the stored grant (the only narrowing path).
		 * @see UpstreamProvider.grantAuthority
		 */
		grantAuthority?: ProviderGrantAuthority | undefined;
	},
) {
	const {
		userInfo,
		providerId,
		accountId,
		tokens,
		requestedScopes,
		callbackURL,
		disableSignUp,
		overrideUserInfo,
		isTrustedProvider,
		sourceProfile,
		grantAuthority,
	} = opts;

	// Resolve-or-create the user and persist the account in one transaction, so a
	// failed account write rolls back a freshly created user instead of orphaning
	// it. The session and verification email are post-commit concerns and stay
	// outside the transaction.
	let resolved: ResolvedOAuthUser | ResolveOAuthUserError;
	let isRegister = false;
	try {
		resolved = await runWithTransaction(c.context.adapter, async () => {
			const r = await resolveOAuthUser(c, {
				userInfo,
				providerId,
				profile: sourceProfile,
				linkPolicy: { isTrustedProvider, disableSignUp, overrideUserInfo },
			});
			// Resolution failed (sign-up disabled, linking gate rejected, or the
			// user create threw): nothing was written, so there is no account to
			// persist and nothing to roll back.
			if (!r.user) {
				return r;
			}
			isRegister = r.isRegister;

			// Re-validate existing users against the fresh provider profile, not the
			// stored row, so a domain policy can reject one whose identity moved out
			// of bounds. `linkedAccount === null` is a first-time implicit link;
			// otherwise a returning sign-in. New users were already gated in
			// createUser. Runs before the account write so a rejection rolls back the
			// link and token refresh.
			if (!r.isRegister) {
				await assertValidUserInfo(c, {
					user: { ...r.user, email: userInfo.email.toLowerCase() },
					source: {
						action: r.linkedAccount === null ? "link-account" : "sign-in",
						method: "oauth",
						oauth: { providerId, profile: sourceProfile },
					},
				});
			}

			await persistOAuthAccount(c, {
				userId: r.user.id,
				providerId,
				accountId,
				tokens,
				requestedScopes,
				mode: "sign-in",
				grantAuthority,
			});
			return r;
		});
	} catch (e) {
		// Re-throw APIErrors so the caller can forward the machine-readable code
		// to its error surface instead of flattening it into a generic string.
		if (isAPIError(e)) {
			throw e;
		}
		c.context.logger.error("Unable to persist OAuth account", e);
		return {
			error: isRegister ? "unable to create user" : "unable to link account",
			data: null,
			isRegister,
		};
	}

	if (!resolved.user) {
		return {
			error: resolved.error,
			data: null,
			isRegister: false,
		};
	}

	const { user } = resolved;

	if (isRegister) {
		await sendSignUpVerificationEmail(c, user, callbackURL);
	}

	const session = await c.context.internalAdapter.createSession(user.id);
	if (!session) {
		return {
			error: "unable to create session",
			data: null,
			isRegister,
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
 * Fire the sign-up verification email when the provider did not vouch for the
 * email and the option is enabled. Runs in the background; a failure must not
 * abort the sign-in.
 */
async function sendSignUpVerificationEmail(
	c: GenericEndpointContext,
	user: User,
	callbackURL: string | undefined,
) {
	if (
		user.emailVerified ||
		!c.context.options.emailVerification?.sendOnSignUp ||
		!c.context.options.emailVerification?.sendVerificationEmail
	) {
		return;
	}
	// The user and account are already committed by the time this runs, so a
	// verification-email failure (token mint or send) must not abort the
	// sign-in. Token creation is awaited inline, so guard the whole block.
	try {
		const token = await createEmailVerificationToken(
			c.context.secret,
			user.email,
			undefined,
			c.context.options.emailVerification.expiresIn,
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
	} catch (e) {
		c.context.logger.error("Failed to send sign-up verification email", e);
	}
}
