import type { AccountKey } from "@better-auth/core/db";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import {
	APIError,
	BASE_ERROR_CODES,
	BetterAuthError,
} from "@better-auth/core/error";
import type { OAuth2Tokens, OAuthProvider } from "@better-auth/core/oauth2";

/**
 * Exposes a provider-declared profile as the raw claim record used by
 * provisioning hooks. Provider profile interfaces are object-shaped but do
 * not need an index signature solely to satisfy this erased boundary.
 */
export function toOAuthProfileRecord(profile: object): Record<string, unknown> {
	return profile as Record<string, unknown>;
}

/**
 * Resolves the stable account key established by an OAuth provider response.
 */
export async function resolveOAuthAccountKey<Profile extends object>(
	provider: OAuthProvider<Profile>,
	tokens: OAuth2Tokens,
	profile: Profile,
): Promise<AccountKey> {
	const accountKeyContext = { tokens, profile };
	const accountSubject = provider.accountSubject;
	const resolvedSubject =
		typeof accountSubject === "function"
			? await accountSubject(accountKeyContext)
			: accountSubject;
	const providerAccountId = String(resolvedSubject);
	if (
		(typeof resolvedSubject === "number" &&
			!Number.isFinite(resolvedSubject)) ||
		providerAccountId.trim().length === 0 ||
		providerAccountId === "undefined" ||
		providerAccountId === "null"
	) {
		throw new BetterAuthError("OAUTH_ACCOUNT_SUBJECT_INVALID");
	}

	const accountIssuer = provider.accountIssuer;
	const resolvedIssuer =
		typeof accountIssuer === "function"
			? await accountIssuer(accountKeyContext)
			: accountIssuer;
	const issuer =
		resolvedIssuer === undefined
			? createLocalAccountIssuer(provider.id)
			: resolvedIssuer;
	if (issuer.trim().length === 0) {
		throw new BetterAuthError("OAUTH_ACCOUNT_ISSUER_INVALID");
	}

	return { issuer, providerAccountId };
}

/**
 * Resolves an OAuth account key at a direct HTTP authentication boundary.
 *
 * Provider resolvers are application code and can reject or return malformed
 * values. Direct sign-in and linking expose all such failures as one stable
 * authentication error instead of leaking implementation details or a 500.
 */
export async function resolveOAuthAccountKeyForAPI<Profile extends object>(
	provider: OAuthProvider<Profile>,
	tokens: OAuth2Tokens,
	profile: Profile,
): Promise<AccountKey> {
	try {
		return await resolveOAuthAccountKey(provider, tokens, profile);
	} catch {
		throw APIError.from(
			"UNAUTHORIZED",
			BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
		);
	}
}
