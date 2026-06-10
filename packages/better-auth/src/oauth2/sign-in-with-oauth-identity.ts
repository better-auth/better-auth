import type {
	GenericEndpointContext,
	UserProvisioningSource,
} from "@better-auth/core";
import { runWithTransaction } from "@better-auth/core/context";
import type {
	OAuth2Tokens,
	ProviderGrantAuthority,
} from "@better-auth/core/oauth2";
import { createEmailVerificationToken } from "../api";
import type { User } from "../types";
import { isAPIError } from "../utils/is-api-error";
import { assertValidUserInfo } from "../utils/validate-user-info";
import { OAUTH_CALLBACK_ERROR_CODES } from "./errors";
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
 * When the provider opts into `requireEmailVerification` and the local email is
 * still unverified, no session is issued: the user/account are persisted but the
 * result carries `EMAIL_NOT_VERIFIED` (the callback redirects with
 * `?error=email_not_verified`, the id-token path returns `403`), and the
 * verification email is (re)sent per `sendOnSignUp` / `sendOnSignIn`.
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
		 * Whether `providerId` may be matched against the configured
		 * `trustedProviders` list to infer trust. Defaults to `true` for built-in
		 * social/OAuth providers. Callers whose `providerId` is user-controlled
		 * (the SSO plugin) pass `false` so a provider named after a trusted social
		 * provider can't launder that trust.
		 */
		trustProviderByName?: boolean | undefined;
		/**
		 * Authentication source metadata forwarded to the `validateUserInfo`
		 * provisioning gate for create, link, and returning sign-in actions.
		 */
		source: UserProvisioningSource;
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
		trustProviderByName,
		source,
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
				source,
				linkPolicy: {
					isTrustedProvider,
					trustProviderByName,
					disableSignUp,
					overrideUserInfo,
				},
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
				const { id: _providerAccountId, ...providerUserInfo } = userInfo;
				await assertValidUserInfo(c, {
					user: {
						...providerUserInfo,
						id: r.user.id,
						email: userInfo.email.toLowerCase(),
					},
					source: {
						...source,
						action: r.linkedAccount === null ? "link-account" : "sign-in",
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

	// Read the provider's verification policy from the resolved provider list, not
	// from `opts`, so the callback, id-token, and oauth-proxy callers all enforce
	// it without each having to thread the flag.
	const requireEmailVerification = c.context.socialProviders.find(
		(p) => p.id === providerId,
	)?.options?.requireEmailVerification;

	// A brand-new user whose provider email is unverified is sent a verification
	// email. Mirrors the credential sign-up rule (`sendOnSignUp`, otherwise the
	// provider's `requireEmailVerification`), so a user the gate is about to block
	// can still verify and recover.
	if (
		isRegister &&
		!user.emailVerified &&
		(c.context.options.emailVerification?.sendOnSignUp ??
			requireEmailVerification)
	) {
		await dispatchVerificationEmail(c, user, callbackURL);
	}

	// Per-provider email-verification gate: when this provider requires a verified
	// email and the local row is still unverified, the user/account are already
	// created or linked, but no session is issued. Opt-in per provider and
	// independent of `emailAndPassword.requireEmailVerification`.
	if (requireEmailVerification && !user.emailVerified) {
		// Returning unverified users get a fresh verification email when the app
		// opted into sign-in sends; brand-new users already received one above.
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
 * Mint a verification token and dispatch the verification email in the
 * background. The user and account are already committed by the time this runs,
 * so a token-mint or send failure must not abort the sign-in. Callers decide
 * *when* to send (`sendOnSignUp` / `sendOnSignIn`); this owns the token and URL.
 */
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
