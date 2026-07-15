import type { IdentityKey } from "@better-auth/core/db";
import { createLocalIdentityIssuer } from "@better-auth/core/db";
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
 * Resolves the stable identity key established by an OAuth provider response.
 */
export async function resolveOAuthIdentityKey<Profile extends object>(
	provider: OAuthProvider<Profile>,
	tokens: OAuth2Tokens,
	profile: Profile,
): Promise<IdentityKey> {
	const identityKeyContext = { tokens, profile };
	const identitySubject = provider.identitySubject;
	if (typeof identitySubject !== "function") {
		throw new BetterAuthError("OAUTH_IDENTITY_SUBJECT_INVALID");
	}
	const resolvedSubject = await identitySubject(identityKeyContext);
	const providerAccountId = String(resolvedSubject);
	if (
		(typeof resolvedSubject === "number" &&
			!Number.isFinite(resolvedSubject)) ||
		providerAccountId.trim().length === 0 ||
		providerAccountId === "undefined" ||
		providerAccountId === "null"
	) {
		throw new BetterAuthError("OAUTH_IDENTITY_SUBJECT_INVALID");
	}

	const identityIssuer = provider.identityIssuer;
	const resolvedIssuer =
		typeof identityIssuer === "function"
			? await identityIssuer(identityKeyContext)
			: identityIssuer;
	const issuer =
		resolvedIssuer === undefined
			? createLocalIdentityIssuer(provider.id)
			: resolvedIssuer;
	if (
		typeof issuer !== "string" ||
		issuer.trim().length === 0 ||
		issuer === "undefined" ||
		issuer === "null"
	) {
		throw new BetterAuthError("OAUTH_IDENTITY_ISSUER_INVALID");
	}

	return { issuer, providerAccountId };
}

/**
 * Resolves an OAuth identity key at a direct HTTP authentication boundary.
 *
 * Provider resolvers are application code and can reject or return malformed
 * values. Direct sign-in and linking expose all such failures as one stable
 * authentication error instead of leaking implementation details or a 500.
 */
export async function resolveOAuthIdentityKeyForAPI<Profile extends object>(
	provider: OAuthProvider<Profile>,
	tokens: OAuth2Tokens,
	profile: Profile,
): Promise<IdentityKey> {
	try {
		return await resolveOAuthIdentityKey(provider, tokens, profile);
	} catch {
		throw APIError.from(
			"UNAUTHORIZED",
			BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
		);
	}
}
