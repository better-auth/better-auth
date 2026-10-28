import type { GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { APIError } from "better-auth/api";
import type { JWSAlgorithms } from "better-auth/plugins";
import type {
	OAuthClientResource,
	OAuthOptions,
	OAuthResource,
	OAuthResourceInput,
	Scope,
} from "./types";
import { ResourceUriSchema } from "./types/zod";

/**
 * Source-of-truth list of asymmetric JWS algorithms supported by the JWT
 * plugin. Mirrors the {@link JWSAlgorithms} literal-union type from
 * `packages/better-auth/src/plugins/jwt/types.ts`. Kept as a runtime const
 * so the admin-CRUD zod schema AND the seed-config validator can reject
 * bad values up-front rather than surfacing opaque jose errors at issuance.
 *
 * MUST stay in sync with `JWSAlgorithms`. The type-level guard immediately
 * below fails the typecheck if the two drift.
 */
export const JWS_ALGORITHMS = [
	"EdDSA",
	"ES256",
	"ES512",
	"PS256",
	"RS256",
] as const;
// Type-level guard: fails the typecheck if `JWS_ALGORITHMS` drifts from the
// `JWSAlgorithms` union in the jwt plugin. Two-way assignment ensures the
// const covers every member AND introduces no extras.
type _JwsAlgorithmsCoverage = [
	Exclude<JWSAlgorithms, (typeof JWS_ALGORITHMS)[number]>,
	Exclude<(typeof JWS_ALGORITHMS)[number], JWSAlgorithms>,
] extends [never, never]
	? true
	: never;
const _jwsAlgorithmsCoverageOk: _JwsAlgorithmsCoverage = true;
void _jwsAlgorithmsCoverageOk;

const JWS_ALGORITHM_SET = new Set<string>(JWS_ALGORITHMS);

/**
 * Upper bound on how many entries are accepted in a JWT's `aud` claim during
 * introspection / revocation validation. Without a cap, a hostile or replayed
 * token can supply hundreds of fake resource identifiers and amplify load on
 * the resource table (one DB lookup per unique unrecognized entry). Real-world
 * deployments use single-digit resource lists; 64 is a generous ceiling that
 * stays well clear of any legitimate use and bounds the per-request DB fan-out.
 *
 * RFC 7519 §4.1.3 does not specify a maximum, so this is a defensive limit,
 * not a spec one. Tokens that exceed it are treated as invalid (introspect →
 * `active: false`, revoke → no-op) rather than triggering the lookup path.
 *
 * @internal
 */
const MAX_AUD_VALUES = 64;

/**
 * Result of {@link assertIdentifierValid}/{@link checkIdentifier}. When
 * `ok: false`, `reason` is a human-readable validation failure suitable for
 * `error_description` (admin endpoints throw `invalid_target`) or a `logger.warn`
 * (seed path skips the entry).
 *
 * @internal
 */
export type IdentifierCheckResult =
	| { ok: true }
	| { ok: false; reason: string };

/**
 * Validates a resource `identifier` per RFC 8707 §2 (absolute URI, no
 * fragment), honoring {@link OAuthOptions.identifierValidator} when provided.
 *
 * Returns a structured result so callers can decide whether to throw
 * (admin CRUD / DCR) or warn-and-skip (config seed path).
 *
 * @internal
 */
async function checkIdentifier(
	opts: Pick<OAuthOptions<Scope[]>, "identifierValidator">,
	identifier: string,
): Promise<IdentifierCheckResult> {
	const customValidator = opts.identifierValidator;
	if (customValidator) {
		const ok = await customValidator(identifier);
		if (!ok) {
			return {
				ok: false,
				reason: `resource identifier ${identifier} failed validation`,
			};
		}
		return { ok: true };
	}
	const parsed = ResourceUriSchema.safeParse(identifier);
	if (!parsed.success) {
		return {
			ok: false,
			reason: `resource identifier ${identifier} is invalid: ${parsed.error.issues[0]?.message ?? "not an absolute URI"}`,
		};
	}
	return { ok: true };
}

/**
 * Variant of {@link checkIdentifier} that throws `invalid_target` on failure.
 * Used by admin CRUD endpoints where validation failure is a client error.
 *
 * @internal
 */
export async function assertIdentifierValid(
	opts: Pick<OAuthOptions<Scope[]>, "identifierValidator">,
	identifier: string,
): Promise<void> {
	const result = await checkIdentifier(opts, identifier);
	if (!result.ok) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_target",
			error_description: result.reason,
		});
	}
}

/**
 * Resolved resource policy for a single `/oauth2/token` (or `/oauth2/authorize`)
 * request. Computed by {@link resolveResourcePolicy} and consumed by the
 * token-issuance pipeline.
 */
export interface ResolvedResourcePolicy {
	/**
	 * The `aud` claim value:
	 * - `undefined` when the request omitted `resource` (legacy behavior)
	 * - a single string when exactly one resource was requested
	 * - an array when multiple were requested
	 *
	 * Includes the implicit `/oauth2/userinfo` audience when `openid` is in
	 * scope — the OIDC userinfo endpoint expects to find itself in `aud`.
	 */
	audienceClaim: string | string[] | undefined;
	/**
	 * Effective access-token TTL in seconds. `null` means "no resource-specific
	 * override — caller should use the plugin default."
	 *
	 * When multiple resources are requested, this is the **minimum** TTL
	 * across all of them (OAuth 2.1 §1.5 bounded-blast-radius rule).
	 */
	accessTokenTtl: number | null;
	/**
	 * Effective refresh-token TTL in seconds. `null` means "no resource-specific
	 * override — caller should use {@link OAuthOptions.refreshTokenExpiresIn}
	 * (or its built-in default)."
	 *
	 * When multiple resources are requested, this is the **minimum** TTL
	 * across all of them (same bounded-blast-radius rule as access tokens).
	 */
	refreshTokenTtl: number | null;
	/**
	 * Effective signing algorithm and key id for the issued token.
	 *
	 * The JWS Protected Header (RFC 7515 §4.1) carries exactly one `alg` and
	 * at most one `kid`, so a single signed token can satisfy a multi-resource
	 * request only when every resource's pins are mutually compatible:
	 * the set of unique non-null `signingAlgorithm` values across requested
	 * resources must be ≤ 1, and the same for `signingKeyId`. When the
	 * compatibility check passes, the single unique pin (if any) is honored;
	 * `null` means "no resource pinned this, fall back to the JWT plugin
	 * default." Conflicts raise `invalid_request`.
	 */
	signingAlgorithm: JWSAlgorithms | null;
	signingKeyId: string | null;
	/**
	 * Merged custom claims across requested resources, returned RAW: reserved
	 * RFC 9068 names are NOT stripped here. Feed this into
	 * `resolveAccessTokenClaims`, which owns the single strip; do not place it on
	 * a token directly or a resource could override an AS-owned claim.
	 */
	rawCustomClaims: Record<string, unknown>;
	/**
	 * True when at least one requested resource requires DPoP-bound access
	 * tokens.
	 */
	dpopBoundAccessTokensRequired: boolean;
	/**
	 * The intersection of the caller's `requestedScopes` with each requested
	 * resource's `allowedScopes`. When no requested resource defines an
	 * allowlist, equals `requestedScopes` unchanged.
	 *
	 * - A resource with `allowedScopes: null` is treated as "no restriction"
	 *   for that resource (other resources' allowlists still apply).
	 * - A resource whose allowlist excludes every requested scope causes
	 *   {@link resolveResourcePolicy} to throw `invalid_scope`.
	 * - Otherwise this is the filtered scope set the token endpoint should
	 *   mint with (RFC 6749 §3.3 narrow-but-don't-widen).
	 */
	effectiveScopes: string[];
}

/**
 * The OIDC userinfo endpoint's resource identifier. Always accepted as an
 * implicit `aud` value when `openid` is in scope — not looked up against
 * `oauthResource` rows.
 */
export const userInfoResource = (baseURL: string) =>
	`${baseURL}/oauth2/userinfo`;

/**
 * Normalizes a `resource` parameter into an array. Accepts the RFC 8707
 * forms: a single string, a string[], or undefined.
 *
 * @internal
 */
function normalizeResourceParam(resource: unknown): string[] | undefined {
	if (resource === undefined || resource === null) return undefined;
	if (typeof resource === "string") return [resource];
	if (Array.isArray(resource)) {
		const result = resource.filter(
			(r): r is string => typeof r === "string" && r.length > 0,
		);
		return result.length > 0 ? result : undefined;
	}
	return undefined;
}

/**
 * Validates a JWT `aud` claim against the OAuth resource model.
 *
 * Every non-implicit audience value must resolve to an `oauthResource` row.
 * Disabled rows still pass because disabling blocks new issuance; deleting the
 * row is the operation that invalidates already-issued tokens.
 *
 * @internal
 */
export async function isAudienceClaimAllowed(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	audienceClaim: string | string[] | undefined,
	implicitAudiences: Iterable<string> = [],
): Promise<boolean> {
	if (audienceClaim === undefined) return true;
	const audienceValues = Array.isArray(audienceClaim)
		? audienceClaim
		: [audienceClaim];
	if (audienceValues.length > MAX_AUD_VALUES) return false;

	const implicitAudienceSet = new Set(implicitAudiences);
	const resourcesToLookup = new Set<string>();
	for (const audienceValue of audienceValues) {
		if (implicitAudienceSet.has(audienceValue)) continue;
		resourcesToLookup.add(audienceValue);
	}
	if (resourcesToLookup.size === 0) return true;

	const rows = await Promise.all(
		Array.from(resourcesToLookup, (resource) =>
			getResource(ctx, opts, resource),
		),
	);
	return rows.every(Boolean);
}

/**
 * Resolves the resource policy for a request.
 *
 * Validation steps (RFC 8707 §3 + per-resource policy):
 *
 * 1. Resolve `resource` parameter to a list of identifiers.
 * 2. For each identifier, look up the {@link OAuthResource} row.
 *    - Missing → `invalid_target`.
 *    - `disabled` → `invalid_target` (no new issuance).
 * 3. If {@link OAuthOptions.enforcePerClientResources} resolves to true,
 *    confirm the client is linked to every requested resource via
 *    `oauthClientResource`. Unlinked → `invalid_target`.
 * 4. Intersect `requestedScopes` with each resource's `allowedScopes`.
 *    Empty intersection → `invalid_scope`.
 * 5. Pick the minimum `accessTokenTtl` across requested resources.
 * 6. Pick signing config — only honored for single-resource requests
 *    (a JWT can only have one signature).
 * 7. Merge per-resource `customClaims` (returned raw; reserved-claim
 *    stripping is owned by `resolveAccessTokenClaims`).
 *
 * When no `resource` param is present, returns an empty policy: no `aud`
 * claim and no resource-specific overrides.
 *
 * @internal
 */
export async function resolveResourcePolicy(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	params: {
		resource: unknown;
		clientId: string;
		requestedScopes: string[];
	},
): Promise<ResolvedResourcePolicy> {
	const requestedResources = normalizeResourceParam(params.resource);
	const includesOpenid = params.requestedScopes.includes("openid");
	const baseURL = ctx.context.baseURL ?? "";
	const userInfoResourceIdentifier = userInfoResource(baseURL);

	if (!requestedResources) {
		// No resource param — no resource-specific decisions to make. Matches
		// pre-entity behavior: an access token requested without `resource`
		// has no `aud` claim, regardless of `openid` scope membership. The
		// implicit userinfo audience is only added when at least one real
		// RFC 8707 resource is requested (see audClaim construction below).
		return {
			audienceClaim: undefined,
			accessTokenTtl: null,
			refreshTokenTtl: null,
			signingAlgorithm: null,
			signingKeyId: null,
			rawCustomClaims: {},
			dpopBoundAccessTokensRequired: false,
			effectiveScopes: [...params.requestedScopes],
		};
	}

	const uniqueRequestedResources = [...new Set(requestedResources)];

	// For each requested resource:
	//   1. Always attempt `getResource(identifier)` first — DB rows are the
	//      authoritative source. Admins can create rows via the CRUD API without
	//      any config.
	//   2. Row exists & enabled → apply per-resource policy.
	//   3. Row exists & disabled → `invalid_target`.
	//   4. No row → `invalid_target`.
	const resolved: OAuthResource[] = [];
	for (const identifier of uniqueRequestedResources) {
		// `/oauth2/userinfo` is an implicit audience for OIDC userinfo lookups
		// (not a configured resource server). Skip the entity check for it.
		if (identifier === userInfoResourceIdentifier) continue;
		const row = await getResource(ctx, opts, identifier);
		if (row) {
			if (row.disabled) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_target",
					error_description: `requested resource ${identifier} is disabled`,
				});
			}
			resolved.push(row);
			continue;
		}
		throw new APIError("BAD_REQUEST", {
			error: "invalid_target",
			error_description: `requested resource ${identifier} is not configured`,
		});
	}

	// Per-client resource linkage check.
	const { value: enforcePerClient } = resolveEnforcePerClientResources(opts);
	if (enforcePerClient && resolved.length > 0) {
		await assertClientLinkedToResources(ctx, opts, params.clientId, resolved);
	}

	// Scope allowlist enforcement — intersect (not all-or-nothing).
	//
	// RFC 6749 §3.3: an authorization server MAY narrow the granted scope set
	// but MUST NOT widen it. Per-resource allowlists are a narrowing filter,
	// not a gate.
	//
	// Algorithm:
	//   - For each requested resource with a non-null allowlist, retain only
	//     the requested scopes that are members of that resource's allowlist.
	//   - A resource whose allowlist excludes every requested scope still
	//     fails closed with `invalid_scope` for that resource (the caller
	//     would otherwise mint a token with no scopes for a resource that
	//     refuses all of them).
	//   - Resources with a null allowlist contribute no narrowing (treated as
	//     "any requested scope is acceptable here").
	let effectiveScopes: string[] = [...params.requestedScopes];
	for (const row of resolved) {
		// FIXME(#11725): treat a stored [] as unset once [] is rejected on input.
		if (row.allowedScopes === null || row.allowedScopes === undefined) {
			continue;
		}
		const allowed = new Set(row.allowedScopes);
		const intersection = effectiveScopes.filter((s) => allowed.has(s));
		if (intersection.length === 0) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_scope",
				error_description: `none of the requested scopes are allowed for resource ${row.identifier}`,
			});
		}
		effectiveScopes = intersection;
	}

	// TTL: minimum across resources that declare one. null means "no override".
	let accessTokenTtl: number | null = null;
	let refreshTokenTtl: number | null = null;
	for (const row of resolved) {
		if (row.accessTokenTtl != null) {
			accessTokenTtl =
				accessTokenTtl === null
					? row.accessTokenTtl
					: Math.min(accessTokenTtl, row.accessTokenTtl);
		}
		if (row.refreshTokenTtl != null) {
			refreshTokenTtl =
				refreshTokenTtl === null
					? row.refreshTokenTtl
					: Math.min(refreshTokenTtl, row.refreshTokenTtl);
		}
	}

	// Signing config: compatibility check.
	//
	// RFC 7515 §4.1 — a JWS Protected Header carries one `alg` and at most
	// one `kid`. So a single token can satisfy a multi-resource request iff
	// the union of per-resource pins collapses to ≤ 1 algorithm AND ≤ 1
	// key id. All-pins-agree is fine (operators commonly pin the same alg
	// fleet-wide); mixed-but-compatible pins (e.g. only one resource pins
	// `alg`, only another pins a matching `kid`) are also fine — the JWT
	// plugin's `resolveSigningKey()` will reject downstream if the chosen
	// kid's key doesn't actually carry the chosen alg.
	//
	// Single-resource requests fall out of this naturally (a one-element
	// resolved list produces at most one pin in each set).
	const uniqueSigningAlgs = new Set<JWSAlgorithms>();
	const uniqueSigningKids = new Set<string>();
	for (const row of resolved) {
		if (row.signingAlgorithm) uniqueSigningAlgs.add(row.signingAlgorithm);
		if (row.signingKeyId) uniqueSigningKids.add(row.signingKeyId);
	}
	if (uniqueSigningAlgs.size > 1) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description:
				"multi-resource request has conflicting signingAlgorithm pins; a single JWS signature cannot satisfy multiple algorithms",
		});
	}
	if (uniqueSigningKids.size > 1) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description:
				"multi-resource request has conflicting signingKeyId pins; a single JWS signature cannot satisfy multiple key ids",
		});
	}
	const signingAlgorithm: JWSAlgorithms | null =
		uniqueSigningAlgs.values().next().value ?? null;
	const signingKeyId: string | null =
		uniqueSigningKids.values().next().value ?? null;

	// Per-resource custom claims: merge in declared order (later resources win
	// on key collisions). Returned raw; `resolveAccessTokenClaims` strips
	// reserved RFC 9068 names from the merged access-token claim set, so the
	// JWT mint and the opaque introspection re-derive can never diverge on
	// which claims are sanitized.
	const mergedClaims: Record<string, unknown> = {};
	for (const row of resolved) {
		if (row.customClaims && typeof row.customClaims === "object") {
			Object.assign(mergedClaims, row.customClaims);
		}
	}
	const dpopBoundAccessTokensRequired = resolved.some(
		(row) => row.dpopBoundAccessTokensRequired === true,
	);

	const audienceIdentifiers = includesOpenid
		? [...uniqueRequestedResources, userInfoResourceIdentifier]
		: uniqueRequestedResources;
	const audClaim = [...new Set(audienceIdentifiers)];

	return {
		audienceClaim: audClaim.length === 1 ? audClaim[0] : audClaim,
		accessTokenTtl,
		refreshTokenTtl,
		signingAlgorithm,
		signingKeyId,
		rawCustomClaims: mergedClaims,
		dpopBoundAccessTokensRequired,
		effectiveScopes,
	};
}

/**
 * Throws `invalid_target` if the client isn't linked to every resource via
 * the `oauthClientResource` join table. Issues one `findMany` per call.
 *
 * @internal
 */
async function assertClientLinkedToResources(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientId: string,
	resources: OAuthResource[],
): Promise<void> {
	if (resources.length === 0) return;
	const modelName =
		opts.schema?.oauthClientResource?.modelName ?? "oauthClientResource";
	const links = await ctx.context.adapter.findMany<OAuthClientResource>({
		model: modelName,
		where: [{ field: "clientId", value: clientId }],
	});
	const linkedSet = new Set(links?.map((l) => l.resourceId) ?? []);
	const unlinked = resources.filter(
		(resource) => !linkedSet.has(resource.identifier),
	);
	if (unlinked.length > 0) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_target",
			error_description: `client ${clientId} is not linked to resource(s) ${unlinked
				.map((resource) => resource.identifier)
				.join(", ")}`,
		});
	}
}

/**
 * Returns `true` when `clientId` is linked, via the `oauthClientResource` join
 * table, to at least one of `resourceIdentifiers`. Authorizes cross-client token
 * introspection (RFC 7662 §2.1/§4): a resource server may introspect a token
 * whose audience it serves, even when a different client issued the token.
 *
 * @internal
 */
export async function isClientLinkedToAnyResource(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientId: string,
	resourceIdentifiers: string[],
): Promise<boolean> {
	if (resourceIdentifiers.length === 0) return false;
	const modelName =
		opts.schema?.oauthClientResource?.modelName ?? "oauthClientResource";
	const links = await ctx.context.adapter.findMany<OAuthClientResource>({
		model: modelName,
		where: [
			{ field: "clientId", value: clientId },
			{ field: "resourceId", operator: "in", value: resourceIdentifiers },
		],
		limit: 1,
	});
	return (links?.length ?? 0) > 0;
}

/**
 * Merges `customClaims` from the existing rows of `resourceIdentifiers` in
 * order (later resources win on collision). Missing rows are skipped; disabled
 * rows are included, since an already-issued token keeps its claims until it
 * expires. Returned raw; `resolveAccessTokenClaims` strips reserved names.
 *
 * Unlike {@link resolveResourcePolicy}, this applies none of the new-issuance
 * gates (disabled, scope allowlist, client linkage), so it is the right way to
 * re-derive claims for an already-issued token at introspection.
 *
 * @internal
 */
export async function getResourceCustomClaims(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	resourceIdentifiers: string[],
): Promise<Record<string, unknown>> {
	if (resourceIdentifiers.length === 0) return {};
	const rows = await ctx.context.adapter.findMany<OAuthResource>({
		model: opts.schema?.oauthResource?.modelName ?? "oauthResource",
		where: [
			{ field: "identifier", operator: "in", value: resourceIdentifiers },
		],
	});
	const rowByIdentifier = new Map(rows.map((row) => [row.identifier, row]));
	const mode = opts.resourceSeedMode ?? "insertOnly";
	const merged: Record<string, unknown> = {};

	for (const identifier of resourceIdentifiers) {
		const dbRow = rowByIdentifier.get(identifier) ?? null;
		const configured = getConfiguredResource(opts, identifier);
		const combined = combineResource(dbRow, configured, mode);
		if (combined?.customClaims && typeof combined.customClaims === "object") {
			Object.assign(merged, combined.customClaims);
		}
	}
	return merged;
}

/**
 * Resolution sources for `enforcePerClientResources`.
 */
type EnforcePerClientResourcesSource = "explicit" | "default";

interface ResolvedEnforcePerClientResources {
	value: boolean;
	source: EnforcePerClientResourcesSource;
}

/**
 * Resolves the effective {@link OAuthOptions.enforcePerClientResources} value.
 *
 * - Explicit `true | false` always wins (`source: "explicit"`).
 * - Otherwise resolve to `true` (`source: "default"`). RFC 8707 §3 per-client
 *   validation is the secure default.
 *
 * Deterministic and pure — safe to call on every validation pass.
 */
function resolveEnforcePerClientResources(
	opts: Pick<OAuthOptions<Scope[]>, "enforcePerClientResources">,
): ResolvedEnforcePerClientResources {
	if (opts.enforcePerClientResources !== undefined) {
		return { value: opts.enforcePerClientResources, source: "explicit" };
	}
	return { value: true, source: "default" };
}

/**
 * In-process cache of {@link OAuthResource} rows, keyed by `identifier`.
 *
 * Opt-in via {@link OAuthOptions.cachedResources} (same membership-Set pattern
 * as `cachedTrustedClients`). Resources outside the set are looked up from the
 * DB on every request — the safe default for deployments that edit rows
 * through external tooling.
 *
 * Module-scoped so admin CRUD handlers can invalidate from anywhere via
 * {@link invalidateResourceCache}.
 */
const resourceCache = new Map<string, OAuthResource>();

/**
 * Removes an entry from the resource cache. Called by admin CRUD handlers
 * after every write. Pass no argument to clear the entire cache.
 *
 * @internal
 */
export function invalidateResourceCache(identifier?: string): void {
	if (identifier === undefined) {
		resourceCache.clear();
		return;
	}
	resourceCache.delete(identifier);
}

export interface ConfiguredResource {
	input: OAuthResourceInput;
	resource: OAuthResource;
}

const configuredResourcesByOptions = new WeakMap<
	OAuthOptions<Scope[]>,
	Map<string, ConfiguredResource>
>();

/**
 * Indexes configured resources in memory by identifier.
 *
 * @internal
 */
export function getConfiguredResourcesMap(
	opts: OAuthOptions<Scope[]>,
): Map<string, ConfiguredResource> {
	let map = configuredResourcesByOptions.get(opts);
	if (map) return map;
	map = new Map();
	const inputs = collectResourceInputs(opts);
	const now = new Date(0);
	for (let input of inputs) {
		if (opts.identifierValidator) {
			try {
				const check = opts.identifierValidator(input.identifier);
				if (typeof check === "boolean") {
					if (!check) {
						logger.warn(
							`oauth-provider: skipping resource for ${input.identifier} — custom validator returned false`,
						);
						continue;
					}
				} else if (check && typeof check === "object" && "then" in check) {
					check
						.then((ok) => {
							if (!ok) {
								logger.warn(
									`oauth-provider: skipping resource for ${input.identifier} — custom validator returned false`,
								);
								map.delete(input.identifier);
							}
						})
						.catch((err) => {
							logger.warn(
								`oauth-provider: skipping resource for ${input.identifier} — custom validator threw: ${err instanceof Error ? err.message : String(err)}`,
							);
							map.delete(input.identifier);
						});
				}
			} catch (err) {
				logger.warn(
					`oauth-provider: skipping resource for ${input.identifier} — custom validator threw: ${err instanceof Error ? err.message : String(err)}`,
				);
				continue;
			}
		} else {
			const parsed = ResourceUriSchema.safeParse(input.identifier);
			if (!parsed.success) {
				logger.warn(
					`oauth-provider: skipping resource for ${input.identifier} — ${parsed.error.issues[0]?.message ?? "not an absolute URI"}`,
				);
				continue;
			}
		}
		if (
			input.signingAlgorithm != null &&
			!JWS_ALGORITHM_SET.has(input.signingAlgorithm)
		) {
			logger.warn(
				`oauth-provider: dropping unsupported signingAlgorithm "${input.signingAlgorithm}" for resource ${input.identifier} — must be one of ${JWS_ALGORITHMS.join(", ")}. Continuing without an algorithm override.`,
			);
			const { signingAlgorithm: _, ...rest } = input;
			input = rest as OAuthResourceInput;
		}
		const resource: OAuthResource = {
			id: input.identifier,
			identifier: input.identifier,
			name: defaultName(input),
			accessTokenTtl: input.accessTokenTtl ?? null,
			refreshTokenTtl: input.refreshTokenTtl ?? null,
			signingAlgorithm: input.signingAlgorithm ?? null,
			signingKeyId: input.signingKeyId ?? null,
			allowedScopes: input.allowedScopes ?? null,
			customClaims: input.customClaims ?? null,
			dpopBoundAccessTokensRequired:
				input.dpopBoundAccessTokensRequired ?? false,
			disabled: input.disabled ?? false,
			policyVersion: 1,
			metadata: input.metadata ?? null,
			createdAt: now,
			updatedAt: now,
		};
		map.set(input.identifier, { input, resource });
	}
	configuredResourcesByOptions.set(opts, map);
	return map;
}

/**
 * Fast synchronous in-memory lookup for a code-configured resource.
 *
 * @internal
 */
export function getConfiguredResource(
	opts: OAuthOptions<Scope[]>,
	identifier: string,
): ConfiguredResource | undefined {
	return getConfiguredResourcesMap(opts).get(identifier);
}

export type ResourceSeedMode = NonNullable<
	OAuthOptions<Scope[]>["resourceSeedMode"]
>;

/**
 * Combines a database row with an in-memory configured resource according to the seed mode:
 * - `insertOnly` (default): if dbRow exists, return dbRow; else return configured.
 * - `merge`: configured fields override dbRow fields where present.
 * - `overwrite`: configured completely replaces dbRow (preserving dbRow id / createdAt).
 *
 * @internal
 */
export function combineResource(
	dbRow: OAuthResource | null,
	configured: ConfiguredResource | undefined,
	mode: ResourceSeedMode = "insertOnly",
): OAuthResource | null {
	if (!configured) return dbRow;
	if (!dbRow) return { ...configured.resource };

	if (mode === "insertOnly") {
		return dbRow;
	}

	if (mode === "merge") {
		const { input } = configured;
		return {
			...dbRow,
			name:
				input.name !== undefined
					? (input.name ?? input.identifier)
					: dbRow.name,
			accessTokenTtl:
				input.accessTokenTtl !== undefined
					? (input.accessTokenTtl ?? null)
					: dbRow.accessTokenTtl,
			refreshTokenTtl:
				input.refreshTokenTtl !== undefined
					? (input.refreshTokenTtl ?? null)
					: dbRow.refreshTokenTtl,
			signingAlgorithm:
				input.signingAlgorithm !== undefined
					? (input.signingAlgorithm ?? null)
					: dbRow.signingAlgorithm,
			signingKeyId:
				input.signingKeyId !== undefined
					? (input.signingKeyId ?? null)
					: dbRow.signingKeyId,
			allowedScopes:
				input.allowedScopes !== undefined
					? (input.allowedScopes ?? null)
					: dbRow.allowedScopes,
			customClaims:
				input.customClaims !== undefined
					? (input.customClaims ?? null)
					: dbRow.customClaims,
			dpopBoundAccessTokensRequired:
				input.dpopBoundAccessTokensRequired !== undefined
					? (input.dpopBoundAccessTokensRequired ?? false)
					: dbRow.dpopBoundAccessTokensRequired,
			disabled: input.disabled !== undefined ? input.disabled : dbRow.disabled,
			metadata:
				input.metadata !== undefined
					? (input.metadata ?? null)
					: dbRow.metadata,
		};
	}

	if (mode === "overwrite") {
		return {
			...configured.resource,
			id: dbRow.id,
			createdAt: dbRow.createdAt,
			updatedAt: dbRow.updatedAt,
		};
	}

	return dbRow;
}

let seededIdentifiersByAdapter = new WeakMap<object, Set<string>>();

/**
 * Looks up an {@link OAuthResource} by `identifier`, consulting the in-process
 * cache when the identifier is in {@link OAuthOptions.cachedResources}.
 * Combines the persisted DB row with in-memory configuration.
 *
 * @internal
 */
export async function getResource(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	identifier: string,
): Promise<OAuthResource | null> {
	let dbResource: OAuthResource | null = null;
	const isCached = opts.cachedResources?.has(identifier);

	if (isCached && resourceCache.has(identifier)) {
		dbResource = Object.assign({}, resourceCache.get(identifier)!);
	} else {
		dbResource = await ctx.context.adapter.findOne<OAuthResource>({
			model: opts.schema?.oauthResource?.modelName ?? "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		if (dbResource && isCached) {
			resourceCache.set(identifier, Object.assign({}, dbResource));
		}
	}

	const adapter = ctx.context?.adapter as object | undefined;
	if (
		adapter &&
		seededIdentifiersByAdapter.get(adapter)?.has(identifier) &&
		!dbResource
	) {
		return null;
	}

	const configured = getConfiguredResource(opts, identifier);
	const mode = opts.resourceSeedMode ?? "insertOnly";
	const combined = combineResource(dbResource, configured, mode);

	return combined ? Object.assign({}, combined) : null;
}

/**
 * Default `name` value when an input doesn't provide one. Mirrors what most
 * admin UIs would show.
 */
function defaultName(input: OAuthResourceInput): string {
	return input.name ?? input.identifier;
}

/**
 * Coerces seed-config `resources` entries — string or object form — into a
 * normalized list of {@link OAuthResourceInput}.
 *
 * @internal
 */
export function collectResourceInputs(
	opts: Pick<OAuthOptions<Scope[]>, "resources">,
): OAuthResourceInput[] {
	const inputs: OAuthResourceInput[] = [];
	if (opts.resources?.length) {
		for (const entry of opts.resources) {
			inputs.push(typeof entry === "string" ? { identifier: entry } : entry);
		}
	}
	return inputs;
}

/**
 * Builds the row payload sent to the adapter for a resource insert. All policy
 * columns default to `null` (= inherit plugin default at issuance time)
 * when the input doesn't specify a value.
 *
 * @internal
 */
export function buildSeedRow(input: OAuthResourceInput, now: Date) {
	return {
		identifier: input.identifier,
		name: defaultName(input),
		accessTokenTtl: input.accessTokenTtl ?? null,
		refreshTokenTtl: input.refreshTokenTtl ?? null,
		signingAlgorithm: input.signingAlgorithm ?? null,
		signingKeyId: input.signingKeyId ?? null,
		allowedScopes: input.allowedScopes ?? null,
		customClaims: input.customClaims ?? null,
		dpopBoundAccessTokensRequired: input.dpopBoundAccessTokensRequired ?? false,
		disabled: input.disabled ?? false,
		policyVersion: 1,
		metadata: input.metadata ?? null,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Lazily creates the `oauthResource` database row for a configured resource if
 * one does not already exist. Idempotent and safe under concurrent multi-process boots.
 *
 * @internal
 */
export async function ensureResourceRow(
	ctx:
		| GenericEndpointContext
		| { context: { adapter: unknown } }
		| { adapter: unknown },
	opts: OAuthOptions<Scope[]>,
	identifier: string,
): Promise<OAuthResource | null> {
	const adapter = (
		"context" in ctx ? ctx.context.adapter : ctx.adapter
	) as GenericEndpointContext["context"]["adapter"];
	const modelName = opts.schema?.oauthResource?.modelName ?? "oauthResource";
	const where = [{ field: "identifier", value: identifier }];

	const existing = await adapter.findOne<OAuthResource>({
		model: modelName,
		where,
	});
	if (existing) return existing;

	const configured = getConfiguredResource(opts, identifier);
	if (!configured) return null;

	const check = await checkIdentifier(opts, configured.input.identifier);
	if (!check.ok) {
		logger.warn(
			`oauth-provider: skipping resource for ${configured.input.identifier} — ${check.reason}`,
		);
		return null;
	}

	const now = new Date();
	let created: OAuthResource | null = null;
	try {
		created = await adapter.create<
			ReturnType<typeof buildSeedRow>,
			OAuthResource
		>({
			model: modelName,
			data: buildSeedRow(configured.input, now),
		});
	} catch (err) {
		const raced = await adapter
			.findOne<OAuthResource>({ model: modelName, where })
			.catch(() => null);
		if (raced) {
			invalidateResourceCache(identifier);
			return raced;
		}
		throw err;
	}

	invalidateResourceCache(identifier);
	return created;
}

/**
 * Logs the resolved value of {@link OAuthOptions.enforcePerClientResources}
 * so deployment admins see which default applied at init. Separated from
 * {@link resolveEnforcePerClientResources} so the latter stays pure and
 * cheap to call from validation flow.
 *
 * @internal
 */
export function logEnforcePerClientResourcesResolution(
	opts: Pick<OAuthOptions<Scope[]>, "enforcePerClientResources">,
): void {
	const resolved = resolveEnforcePerClientResources(opts);
	logger.info(
		`oauth-provider: enforcePerClientResources resolved to ${resolved.value} (${resolved.source})`,
	);
}

/**
 * Backwards compatibility stubs for tests.
 * @internal
 */
export async function seedResourcesOnce(
	ctx?: unknown,
	opts?: unknown,
): Promise<void> {
	if (!ctx || !opts) return;
	const oauthOpts = opts as OAuthOptions<Scope[]>;
	const inputs = collectResourceInputs(oauthOpts);
	const targetCtx =
		typeof ctx === "object" && ctx !== null && "adapter" in ctx
			? { context: ctx }
			: (ctx as GenericEndpointContext);

	const adapter = (
		targetCtx &&
		typeof targetCtx === "object" &&
		"context" in targetCtx &&
		targetCtx.context &&
		typeof targetCtx.context === "object" &&
		"adapter" in targetCtx.context
			? targetCtx.context.adapter
			: targetCtx && typeof targetCtx === "object" && "adapter" in targetCtx
				? (targetCtx as { adapter: unknown }).adapter
				: null
	) as object | null;

	if (adapter) {
		let set = seededIdentifiersByAdapter.get(adapter);
		if (!set) {
			set = new Set();
			seededIdentifiersByAdapter.set(adapter, set);
		}
		for (const input of inputs) {
			set.add(input.identifier);
			await ensureResourceRow(targetCtx, oauthOpts, input.identifier);
		}
	} else {
		for (const input of inputs) {
			await ensureResourceRow(targetCtx, oauthOpts, input.identifier);
		}
	}
}
export function resetSeedStateForTests(): void {
	seededIdentifiersByAdapter = new WeakMap();
}
