import type { User } from "better-auth/types";
import type { OAuthOptions, Scope } from "./types";

/**
 * The OIDC scope value that requests a standard claim (OIDC Core §5.4).
 */
type StandardClaimScope = "profile" | "email";

interface StandardClaimDefinition {
	/** Scope value that requests this claim (OIDC Core §5.4). */
	scope: StandardClaimScope;
	/** Resolves the claim value from the Better Auth user. */
	resolve: (user: User) => unknown;
}

function splitDisplayName(name: string): {
	given?: string;
	family?: string;
} {
	const parts = name.split(" ").filter((part) => part !== "");
	if (parts.length <= 1) return {};
	return { given: parts.slice(0, -1).join(" "), family: parts.at(-1) };
}

/**
 * The OIDC Standard Claims (OIDC Core §5.1) that Better Auth resolves from its
 * own user model, each paired with the scope that requests it (§5.4).
 *
 * This is the single source for UserInfo scope-claim resolution, individual
 * `claims.userinfo` resolution, the discovery `claims_supported` advertisement,
 * and the bound on requested claim names. Adding a standard claim Better Auth
 * can resolve means adding one entry here, not editing UserInfo, the metadata,
 * and the plugin init separately.
 *
 * These claims are delivered only at the UserInfo endpoint, never the ID token:
 * the authorization code flow always issues an access token, so §5.4 routes
 * scope-requested claims to UserInfo. Deployments that support further standard
 * profile claims (such as `birthdate` or `zoneinfo`) supply them through
 * `customUserInfoClaims` and advertise them in `claims_supported`.
 */
export const STANDARD_CLAIMS = {
	name: { scope: "profile", resolve: (user) => user.name ?? undefined },
	picture: { scope: "profile", resolve: (user) => user.image ?? undefined },
	given_name: {
		scope: "profile",
		resolve: (user) => splitDisplayName(user.name).given,
	},
	family_name: {
		scope: "profile",
		resolve: (user) => splitDisplayName(user.name).family,
	},
	email: { scope: "email", resolve: (user) => user.email ?? undefined },
	email_verified: {
		scope: "email",
		resolve: (user) => user.emailVerified ?? false,
	},
} satisfies Record<string, StandardClaimDefinition>;

export type StandardClaimName = keyof typeof STANDARD_CLAIMS;

export const STANDARD_CLAIM_NAMES = Object.keys(
	STANDARD_CLAIMS,
) as StandardClaimName[];

/**
 * The claim names this provider advertises it can supply (discovery
 * `claims_supported`): the operator's `advertisedMetadata.claims_supported`
 * override when set, otherwise the scope-derived standard set computed at plugin
 * init. Used both to advertise and to bound requested `claims.userinfo` names so
 * a client cannot pin arbitrary attacker-controlled strings onto stored tokens.
 */
export function getSupportedClaims(
	opts: OAuthOptions<Scope[]> & { claims?: string[] },
): string[] {
	return opts.advertisedMetadata?.claims_supported ?? opts.claims ?? [];
}
