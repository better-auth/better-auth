import type { GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import type { User } from "better-auth/types";
import { collectExtensionAccessTokenClaims } from "./extensions";
import type { OAuthOptions, SchemaClient, Scope } from "./types";
import type { GrantType } from "./types/oauth";

/**
 * Claim names the authorization server owns on a JWT access token, which no
 * claim source (the `customAccessTokenClaims` plugin option, an extension
 * contributor, or a resource row's `customClaims`) may override. The AS is the
 * only source of truth for issuer identity, subject, audience, lifetime, scope,
 * authentication context, the token's stable ID, and its sender-constraint
 * (`cnf`).
 *
 * @see RFC 9068 §2.2 (registered access-token claims)
 * @see RFC 7800 / RFC 9449 §6 (`cnf` confirmation — the token's bound key)
 */
const RESERVED_ACCESS_TOKEN_CLAIMS = new Set([
	"iss",
	"sub",
	"aud",
	"exp",
	"iat",
	"jti",
	"client_id",
	"scope",
	"auth_time",
	"acr",
	"amr",
	"cnf",
]);

/**
 * Returns a copy of `claims` with reserved AS-owned names removed. Emits a
 * `warn` naming the stripped keys when any were present (never silently
 * dropped: surfacing the override attempt matters more than minimizing log
 * noise). Stable iteration order (`Object.entries`) is preserved so token-debug
 * logs stay reproducible across runs.
 */
function stripReservedClaims(
	claims: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
	if (!claims) return {};
	const stripped: string[] = [];
	const safe: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(claims)) {
		if (RESERVED_ACCESS_TOKEN_CLAIMS.has(key)) {
			stripped.push(key);
			continue;
		}
		safe[key] = value;
	}
	if (stripped.length > 0) {
		logger.warn(
			`oauth-provider: stripped reserved access-token claim name(s): ${stripped.join(
				", ",
			)}. The AS owns these claim values.`,
		);
	}
	return safe;
}

/**
 * Inputs for {@link resolveAccessTokenClaims}. Every field is derivable from
 * persisted token state, so the resolver produces the same enriched claim set
 * whether it runs at issuance (from the grant) or at introspection (from the
 * stored opaque-token row).
 */
export interface AccessTokenClaimsInput {
	ctx: GenericEndpointContext;
	opts: OAuthOptions<Scope[]>;
	/** Token subject; `null`/`undefined` for `client_credentials`. */
	user: User | null | undefined;
	client: SchemaClient<Scope[]>;
	/** Effective (post resource-allowlist narrowing) scopes. */
	scopes: string[];
	resources: string[] | undefined;
	referenceId: string | undefined;
	/** Parsed client metadata, as returned by `parseClientMetadata`. */
	metadata: Record<string, unknown> | undefined;
	/**
	 * Grant type passed to extension claim contributors. Pass `undefined` at
	 * introspection: the opaque-token row does not persist the grant, so
	 * contributed access-token claims must be grant-type-stable.
	 */
	grantType: GrantType | undefined;
	/**
	 * Session the tokens are issued for, when one is available. Set at issuance
	 * for the session-backed grants; `undefined` at introspection, since the
	 * opaque-token row carries no live session. Best-effort, mirroring the field
	 * on {@link OAuthClaimExtensionInput}.
	 */
	sessionId: string | undefined;
	/**
	 * Per-issuance claims a grant handler supplied via `accessTokenClaims`.
	 * Available only at issuance; `undefined` at introspection.
	 */
	perRequestClaims: Record<string, unknown> | undefined;
	/** Per-resource `customClaims` from `resolveResourcePolicy` (raw, not yet stripped). */
	resourcePolicyClaims: Record<string, unknown>;
}

/**
 * The single authority for the enriched (non-AS-owned) claim set an access
 * token carries. Both the JWT mint and the opaque-token introspection
 * re-derive path call this function, so the two formats cannot drift, and
 * reserved RFC 9068 names are stripped unconditionally here so no caller can
 * forget to.
 *
 * Precedence, lowest to highest: extension contributors < per-issuance
 * `accessTokenClaims` < plugin `customAccessTokenClaims` < per-resource
 * `customClaims`. Reserved names are removed from the merged result.
 *
 * Returns only the enriched claims; the caller stamps the AS-owned claims
 * (`iss`/`sub`/`aud`/`exp`/`iat`/`jti`/`client_id`/`scope`/...) itself, so they
 * always win.
 */
export async function resolveAccessTokenClaims(
	input: AccessTokenClaimsInput,
): Promise<Record<string, unknown>> {
	const {
		ctx,
		opts,
		user,
		client,
		scopes,
		resources,
		referenceId,
		metadata,
		grantType,
		sessionId,
		perRequestClaims,
		resourcePolicyClaims,
	} = input;
	const extensionClaims = await collectExtensionAccessTokenClaims(opts, {
		ctx,
		opts,
		user,
		client,
		scopes,
		grantType,
		referenceId,
		sessionId,
		resources,
		metadata,
	});
	const pluginClaims = opts.customAccessTokenClaims
		? await opts.customAccessTokenClaims({
				user,
				scopes,
				resources,
				referenceId,
				metadata,
			})
		: {};
	return stripReservedClaims({
		...extensionClaims,
		...(perRequestClaims ?? {}),
		...pluginClaims,
		...resourcePolicyClaims,
	});
}
