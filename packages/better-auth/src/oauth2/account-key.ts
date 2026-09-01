import type { BetterAuthOptions } from "@better-auth/core";
import type { AccountKey } from "@better-auth/core/db";
import { createOAuthAccountIssuer } from "@better-auth/core/db";
import {
	APIError,
	BASE_ERROR_CODES,
	BetterAuthError,
} from "@better-auth/core/error";
import type { OAuth2Tokens, OAuthProvider } from "@better-auth/core/oauth2";

type AccountIdentityStrategy = NonNullable<
	BetterAuthOptions["account"]
>["identityStrategy"];

/**
 * Exposes a provider-declared profile as the raw claim record used by
 * provisioning hooks. Provider profile interfaces are object-shaped but do
 * not need an index signature solely to satisfy this erased boundary.
 */
export function toOAuthProfileRecord(profile: object): Record<string, unknown> {
	return profile as Record<string, unknown>;
}

/**
 * Resolves the issuer a provider establishes for every account it
 * authenticates, or `undefined` when the issuer comes from the provider
 * response and is only known during an authentication.
 */
export function resolveStaticOAuthAccountIssuer<Profile extends object>(
	provider: Pick<OAuthProvider<Profile>, "accountIssuer" | "id">,
): string | undefined {
	const accountIssuer = provider.accountIssuer;
	if (typeof accountIssuer === "function") return undefined;
	return accountIssuer ?? createOAuthAccountIssuer(provider.id);
}

/**
 * Resolves the stable account key established by an OAuth provider response.
 */
export async function resolveOAuthAccountKey<Profile extends object>(
	provider: OAuthProvider<Profile>,
	tokens: OAuth2Tokens,
	profile: Profile,
	identityStrategy?: AccountIdentityStrategy,
): Promise<AccountKey> {
	const accountKeyContext = { tokens, profile };
	const accountSubject = provider.accountSubject;
	const resolvedSubject = await accountSubject(accountKeyContext);
	const accountId = String(resolvedSubject);
	if (
		(typeof resolvedSubject === "number" &&
			!Number.isFinite(resolvedSubject)) ||
		accountId.trim().length === 0 ||
		accountId === "undefined" ||
		accountId === "null"
	) {
		throw new BetterAuthError("OAUTH_ACCOUNT_SUBJECT_INVALID");
	}

	const accountIssuer = provider.accountIssuer;
	const issuer =
		identityStrategy === "provider-id"
			? createOAuthAccountIssuer(provider.id)
			: typeof accountIssuer === "function"
				? await accountIssuer(accountKeyContext)
				: resolveStaticOAuthAccountIssuer(provider);
	if (
		typeof issuer !== "string" ||
		issuer.trim().length === 0 ||
		issuer === "undefined" ||
		issuer === "null"
	) {
		throw new BetterAuthError("OAUTH_ACCOUNT_ISSUER_INVALID");
	}

	return { issuer, accountId };
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
	identityStrategy?: AccountIdentityStrategy,
): Promise<AccountKey> {
	try {
		return await resolveOAuthAccountKey(
			provider,
			tokens,
			profile,
			identityStrategy,
		);
	} catch {
		throw APIError.from(
			"UNAUTHORIZED",
			BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
		);
	}
}
