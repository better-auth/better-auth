import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { accumulateGrantedScopes } from "@better-auth/core/oauth2";
import { setAccountCookie } from "../cookies/session-store";
import type { Account } from "../types";
import { setTokenUtil } from "./utils";

/**
 * How {@link persistOAuthAccount} treats an account that already exists.
 *
 * - `signin`: a sign-in (or re-authentication) to an existing identity. When
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
export type PersistOAuthAccountMode = "signin" | "link" | "refresh";

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
	 * Treat the observed scopes as the authoritative, complete grant and
	 * **replace** the stored `grantedScopes` with them instead of unioning. This
	 * is the only path allowed to narrow the grant.
	 *
	 * Use it only when the provider reports the full combined grant rather than a
	 * per-request projection: Google's `include_granted_scopes` token response,
	 * an explicit re-consent, or a token-introspection read. Honored only when the
	 * provider actually echoed scopes; an omitted/empty echo is treated as
	 * non-authoritative and falls back to a union, so resync can never shrink the
	 * grant to this flow's request. Without it, writes are union-only and never
	 * shrink (RFC 6749 §3.3/§5.1).
	 *
	 * @default false
	 */
	resync?: boolean | undefined;
}

/**
 * The single writer of an OAuth account's tokens and granted-scope set.
 *
 * Owns, so no caller re-implements them:
 * - token encryption via {@link setTokenUtil} (never a caller duty);
 * - grant accumulation via {@link accumulateGrantedScopes}
 *   (`union(existing, echoed-else-requested)`, RFC 6749 §3.3/§5.1);
 * - find-update-or-create against `findAccountByProviderId`;
 * - account-cookie seeding when `account.storeAccountCookie` is enabled.
 *
 * Grant semantics (never shrinks unless `resync` is set):
 * - create / link / new identity: `grantedScopes = union(existing, granted)`;
 * - re-authentication of an already-linked account (`mode: "signin"`, account
 *   exists): tokens refresh but the grant is carried through unchanged (still a
 *   union, so it can grow but never narrow);
 * - `refresh` (RFC 6749 §6): tokens rotate on the existing row, the grant is
 *   carried through verbatim (the response `scope` is ignored entirely);
 * - `resync`: replace the stored grant with the freshly observed set, the only
 *   path that may narrow it (see {@link PersistOAuthAccountParams.resync}).
 *
 * @returns the persisted account. On a `signin` re-auth with
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
		resync,
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

	// A resync drops the stored grant from the union so the observed set wins
	// outright (the only path that may narrow). It is honored ONLY when the
	// provider actually echoed scopes: an omitted/empty echo is not an
	// authoritative full grant, and replacing with the request fallback would
	// wrongly shrink the grant to this flow's request. A refresh ignores the
	// echoed scope entirely and carries the stored grant through; a normal write
	// unions so the result can only grow.
	const replaceGrant = resync === true && (tokens.scopes?.length ?? 0) > 0;
	const grantedScopes =
		mode === "refresh"
			? (existing?.grantedScopes ?? [])
			: accumulateGrantedScopes(
					replaceGrant ? undefined : existing?.grantedScopes,
					tokens.scopes,
					requestedScopes,
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
			mode === "signin" &&
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
