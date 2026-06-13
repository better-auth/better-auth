import type { GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import type { User } from "better-auth/types";
import { collectExtensionAccessTokenClaims } from "./extensions";
import type { OAuthOptions, SchemaClient, Scope } from "./types";
import type { GrantType } from "./types/oauth";

/**
 * Claim names reserved by RFC 9068 §2.2 for OAuth 2.0 JWT-formatted access
 * tokens. No claim source (the `customAccessTokenClaims` plugin option or a
 * resource row's `customClaims`) can override these: the authorization server
 * is the only source of truth for issuer identity, subject, audience, lifetime,
 * scope, authentication context, and the token's stable ID.
 *
 * @see RFC 9068 §2.2 (Header and Data Structures)
 */
const RESERVED_RFC9068_CLAIMS = new Set([
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
]);

/**
 * Returns a copy of `claims` with reserved RFC 9068 names removed. Emits a
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
		if (RESERVED_RFC9068_CLAIMS.has(key)) {
			stripped.push(key);
			continue;
		}
		safe[key] = value;
	}
	if (stripped.length > 0) {
		logger.warn(
			`oauth-provider: stripped reserved RFC 9068 claim name(s) from access-token claims: ${stripped.join(
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
	 * Per-issuance claims a grant handler supplied via `extra.accessTokenClaims`.
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
 * `extra.accessTokenClaims` < plugin `customAccessTokenClaims` < per-resource
 * `customClaims`. Reserved names are removed from the merged result.
 *
 * Returns only the enriched claims; the caller stamps the AS-owned claims
 * (`iss`/`sub`/`aud`/`exp`/`iat`/`jti`/`client_id`/`scope`/...) itself, so they
 * always win.
 */
export async function resolveAccessTokenClaims(
	input: AccessTokenClaimsInput,
): Promise<Record<string, unknown>> {
	const { ctx, opts, user, client, scopes, resources, referenceId, metadata } =
		input;
	const extensionClaims = await collectExtensionAccessTokenClaims(opts, {
		ctx,
		opts,
		user,
		client,
		scopes,
		grantType: input.grantType,
		referenceId,
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
		...(input.perRequestClaims ?? {}),
		...pluginClaims,
		...input.resourcePolicyClaims,
	});
}
