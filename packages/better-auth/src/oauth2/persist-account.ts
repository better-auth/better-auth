import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type {
	GrantAuthority,
	OAuth2Tokens,
	ProviderGrantAuthority,
} from "@better-auth/core/oauth2";
import {
	normalizeScopes,
	readGrantedScopes,
	unionGrantedScopes,
} from "@better-auth/core/oauth2";
import { setAccountCookie } from "../cookies/session-store";
import type { Account } from "../types";
import { setTokenUtil } from "./token-encryption";

/**
 * How {@link persistOAuthAccount} treats an account that already exists.
 *
 * - `sign-in`: a sign-in (or re-authentication) to an existing identity. When
 *   the account is already linked, tokens are refreshed only if
 *   `account.updateAccountOnSignIn` is not `false`; the grant is never
 *   narrowed.
 * - `link`: an explicit link of a provider identity to a user. Tokens are
 *   always written and the grant is unioned.
 * - `refresh`: an RFC 6749 §6 token rotation against an already-stored account.
 *   Tokens are rewritten on the existing row; the grant is never touched (a
 *   refresh response, even one echoing a narrower `scope`, is a downscoped
 *   projection, not a grant change). Never creates an account: if none exists,
 *   {@link persistOAuthAccount} returns `undefined`.
 */
export type PersistOAuthAccountMode = "sign-in" | "link" | "refresh";

export interface PersistOAuthAccountParams {
	/** Local user the provider identity belongs to. */
	userId: string;
	/** OAuth provider id, e.g. `"google"`. */
	providerId: string;
	/** Provider's account id for this identity (the `sub`/profile id). */
	accountId: string;
	/**
	 * Tokens from the provider. Their `scopes` are the echoed grant; encryption
	 * is applied here, so callers must pass them in plaintext.
	 */
	tokens: OAuth2Tokens;
	/**
	 * The effective scope set requested of the provider for this flow (provider
	 * defaults + configured + per-request). Used as the §5.1 fallback when the
	 * provider omits `scope` from its token response.
	 */
	requestedScopes?: string[] | undefined;
	mode: PersistOAuthAccountMode;
	/**
	 * The provider's declared {@link GrantAuthority} for its echoed token-response
	 * `scope`. `"full-grant"` lets a non-empty echo replace the stored grant (the
	 * only path that may narrow it); anything else unions. An omitted/empty echo
	 * is always treated as `"absent-echo"` regardless of this value, so a silent
	 * provider can never shrink the grant (RFC 6749 §3.3/§5.1).
	 *
	 * @default "projection"
	 */
	grantAuthority?: ProviderGrantAuthority | undefined;
}

/**
 * The single writer of an OAuth account's tokens and granted-scope set.
 *
 * Owns, so no caller re-implements them:
 * - token encryption via {@link setTokenUtil} (never a caller duty);
 * - grant accumulation via {@link unionGrantedScopes}
 *   (`union(existing, echoed-else-requested)`, RFC 6749 §3.3/§5.1);
 * - find-update-or-create against `findAccountByProviderId`;
 * - account-cookie seeding when `account.storeAccountCookie` is enabled.
 *
 * Grant semantics (never shrinks unless the provider declares `"full-grant"`):
 * - create / link / new identity: `grantedScopes = union(existing, granted)`;
 * - re-authentication of an already-linked account (`mode: "sign-in"`, account
 *   exists): tokens refresh but the grant is carried through unchanged (still a
 *   union, so it can grow but never narrow);
 * - `refresh` (RFC 6749 §6): tokens rotate on the existing row, the grant is
 *   carried through verbatim (the response `scope` is ignored entirely);
 * - `grantAuthority: "full-grant"` with a non-empty echo: replace the stored
 *   grant with the freshly observed set, the only path that may narrow it.
 *
 * @returns the persisted account. On a `sign-in` re-auth with
 * `updateAccountOnSignIn` disabled the stored tokens are left untouched, but the
 * existing account is still returned (and its cookie re-seeded). `undefined`
 * when the underlying create yields no row, or in `refresh` mode when no
 * account exists to rotate.
 */
export async function persistOAuthAccount(
	c: GenericEndpointContext,
	params: PersistOAuthAccountParams,
): Promise<Account | undefined> {
	const {
		userId,
		providerId,
		accountId,
		tokens,
		requestedScopes,
		mode,
		grantAuthority,
	} = params;

	const existing = await c.context.internalAdapter.findAccountByProviderId(
		accountId,
		providerId,
	);

	// A refresh rotates tokens against a known account; with nothing to rotate
	// there is no write to make and (unlike sign-in) no account to create.
	if (mode === "refresh" && !existing) {
		return undefined;
	}

	// Resolve how much to trust this token response's echoed scope. An
	// omitted/empty echo is always `absent-echo` (the grant equals what was
	// requested, §5.1), regardless of what the provider declared, so a silent
	// provider can never shrink the grant.
	const echoedScopes = tokens.scopes;
	const authority: GrantAuthority = !echoedScopes?.length
		? "absent-echo"
		: grantAuthority === "full-grant"
			? "full-grant"
			: "projection";

	// full-grant: the echo is the complete grant, so replace (the only narrowing
	// path). absent-echo: union the requested set (§5.1). projection: union the
	// echoed subset onto the stored grant. refresh (§6): carry the stored grant
	// through verbatim, ignoring the echoed scope entirely.
	const grantedScopes =
		mode === "refresh"
			? readGrantedScopes(existing?.grantedScopes)
			: authority === "full-grant"
				? normalizeScopes(echoedScopes)
				: authority === "absent-echo"
					? unionGrantedScopes(
							existing?.grantedScopes,
							undefined,
							requestedScopes,
						)
					: unionGrantedScopes(
							existing?.grantedScopes,
							echoedScopes,
							undefined,
						);

	if (existing) {
		// A provider identity belongs to exactly one user. Writing tokens or the
		// grant for it under a different user is an account-takeover vector, so
		// reject it the way the redirect callback always has.
		if (existing.userId.toString() !== userId.toString()) {
			throw APIError.from(
				"UNAUTHORIZED",
				BASE_ERROR_CODES.SOCIAL_ACCOUNT_ALREADY_LINKED,
			);
		}

		// A re-auth to an already-linked account must not overwrite tokens when
		// `updateAccountOnSignIn` is disabled. The grant is independent of that
		// gate: it still unions (it can grow from a freshly-consented scope) and is
		// persisted so the database and cookie agree, but it never narrows.
		if (
			mode === "sign-in" &&
			c.context.options.account?.updateAccountOnSignIn === false
		) {
			const updated = await c.context.internalAdapter.updateAccount(
				existing.id,
				{ grantedScopes },
			);
			const account = updated ?? { ...existing, grantedScopes };
			if (c.context.options.account?.storeAccountCookie) {
				await setAccountCookie(c, account);
			}
			return account;
		}

		const updateData = Object.fromEntries(
			Object.entries({
				idToken: tokens.idToken,
				accessToken: await setTokenUtil(tokens.accessToken, c.context),
				refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
				refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
				grantedScopes,
			}).filter(([, value]) => value !== undefined),
		);

		const updated = await c.context.internalAdapter.updateAccount(
			existing.id,
			updateData,
		);

		const account = updated ?? { ...existing, ...updateData };
		if (c.context.options.account?.storeAccountCookie) {
			await setAccountCookie(c, account);
		}
		return account;
	}

	const created = await c.context.internalAdapter.createAccount({
		userId,
		providerId,
		accountId,
		idToken: tokens.idToken,
		accessToken: await setTokenUtil(tokens.accessToken, c.context),
		refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
		accessTokenExpiresAt: tokens.accessTokenExpiresAt,
		refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
		grantedScopes,
	});

	if (created && c.context.options.account?.storeAccountCookie) {
		await setAccountCookie(c, created);
	}
	return created ?? undefined;
}
