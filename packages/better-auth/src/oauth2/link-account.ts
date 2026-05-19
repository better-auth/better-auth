import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import { isDevelopment, logger } from "@better-auth/core/env";
import { createEmailVerificationToken } from "../api";
import { setAccountCookie } from "../cookies/session-store";
import type { Account, User } from "../types";
import { isAPIError } from "../utils/is-api-error";
import { setTokenUtil } from "./utils";

/**
 * Strips inline base64 `data:` URIs from OAuth-provided profile images.
 *
 * Microsoft Entra ID (via the library's own Graph `/me/photo/$value`
 * fetch in `packages/core/src/social-providers/microsoft-entra-id.ts`)
 * and some Keycloak/OIDC setups return a `picture` claim that is an
 * embedded base64 image instead of a URL. That value cascades into:
 *   1. the session cookie cache (blows past Chromium's per-cookie 4 KB
 *      limit per RFC 6265 §6.1, failing OAuth callback with
 *      `ERR_RESPONSE_HEADERS_TOO_BIG`)
 *   2. JWT payloads when the `jwt` plugin is enabled (the default
 *      payload is the full user object)
 *
 * OIDC Core §5.1 defines `picture` as a URL, so a `data:` URI is
 * out-of-spec; the `data:` prefix is a near-zero-false-positive signal
 * (real signed CDN URLs, Unicode names and enterprise claims never
 * start with it). Match is case-insensitive per RFC 2397 (URI scheme
 * names are case-insensitive).
 *
 * The opt-out (`account.allowInlineProfileImage`) is for users with an
 * existing `mapProfileToUser` or `databaseHooks.user.create.before`
 * pipeline that uploads the inline image to a CDN.
 *
 * @see https://github.com/better-auth/better-auth/issues/8338
 */
function sanitizeOAuthProfileImage<T extends { image?: string | null }>(
	userInfo: T,
	options: BetterAuthOptions,
	log: { warn: (msg: string) => void },
): T {
	if (options.account?.allowInlineProfileImage) return userInfo;
	const image = userInfo.image;
	if (typeof image !== "string" || !image.toLowerCase().startsWith("data:")) {
		return userInfo;
	}
	log.warn(
		"Stripped inline data: URI from OAuth profile image " +
			"(would have exceeded the per-cookie size limit and bloated " +
			"JWT payloads if the jwt plugin is enabled). " +
			"Set account.allowInlineProfileImage=true to keep it, or use " +
			"mapProfileToUser / databaseHooks.user.create.before to upload " +
			"the image to a CDN. " +
			"See https://github.com/better-auth/better-auth/issues/8338",
	);
	return { ...userInfo, image: null };
}

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
	},
) {
	const { account, callbackURL, disableSignUp, overrideUserInfo } = opts;
	const userInfo = sanitizeOAuthProfileImage(
		opts.userInfo,
		c.context.options,
		c.context.logger,
	);
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
