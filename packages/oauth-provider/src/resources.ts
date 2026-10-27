import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
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
 * Checks whether an {@link OAuthResource} row is tombstoned (durably deleted).
 *
 * @internal
 */
export function isResourceTombstoned(
	row: OAuthResource | null | undefined,
): boolean {
	if (!row || !row.metadata) return false;
	let meta = row.metadata;
	if (typeof meta === "string") {
		try {
			meta = JSON.parse(meta);
		} catch {
			return false;
		}
	}
	return Boolean(
		meta &&
			typeof meta === "object" &&
			Object.prototype.hasOwnProperty.call(meta, "__deleted") &&
			(meta as Record<string, unknown>).__deleted === true,
	);
}

/**
 * Strips `__deleted` from metadata and normalizes empty or invalid values to `null`.
 *
 * @internal
 */
export function omitDeleted(metadata: unknown): Record<string, unknown> | null {
	if (!metadata) {
		return null;
	}
	let target: Record<string, unknown>;
	if (typeof metadata === "string") {
		try {
			const parsed = JSON.parse(metadata);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return null;
			}
			target = parsed as Record<string, unknown>;
		} catch {
			return null;
		}
	} else if (typeof metadata === "object" && !Array.isArray(metadata)) {
		target = metadata as Record<string, unknown>;
	} else {
		return null;
	}

	const result: Record<string, unknown> = {};
	for (const key of Object.keys(target)) {
		if (key !== "__deleted") {
			result[key] = target[key];
		}
	}
	return Object.keys(result).length > 0 ? result : null;
}

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
	const merged: Record<string, unknown> = {};
	// Merge in the token's resource order so "later resource wins" still holds.
	for (const identifier of resourceIdentifiers) {
		const row = rowByIdentifier.get(identifier);
		if (row && isResourceTombstoned(row)) {
			continue;
		}
		const entry = await getConfiguredResource(opts, identifier);

		let effectiveResource: OAuthResource | null = null;
		if (row && entry) {
			effectiveResource = combineResource(
				row,
				entry,
				opts.resourceSeedMode ?? "insertOnly",
			);
		} else if (row) {
			effectiveResource = row;
		} else if (entry) {
			effectiveResource = entry.resource;
		}

		if (
			effectiveResource?.customClaims &&
			typeof effectiveResource.customClaims === "object"
		) {
			Object.assign(merged, effectiveResource.customClaims);
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

interface ConfiguredResourceEntry {
	input: OAuthResourceInput;
	resource: OAuthResource;
	validation: Promise<IdentifierCheckResult> | null;
	invalid: boolean;
}

const configuredResourceMaps = new WeakMap<
	OAuthOptions<Scope[]>,
	Map<string, ConfiguredResourceEntry>
>();

/**
 * Indexes configured resources into an in-memory Map keyed by identifier.
 * Zero database I/O is performed.
 *
 * @internal
 */
export function indexConfiguredResources(
	opts: OAuthOptions<Scope[]>,
): Map<string, ConfiguredResourceEntry> {
	let map = configuredResourceMaps.get(opts);
	if (map) return map;

	map = new Map<string, ConfiguredResourceEntry>();
	configuredResourceMaps.set(opts, map);

	const inputs = collectResourceInputs(opts);
	if (inputs.length === 0) return map;

	const now = new Date();
	const mode = opts.resourceSeedMode ?? "insertOnly";
	for (const rawInput of inputs) {
		let input = rawInput;
		if (
			input.signingAlgorithm != null &&
			!JWS_ALGORITHM_SET.has(input.signingAlgorithm)
		) {
			logger.warn(
				`oauth-provider: dropping unsupported signingAlgorithm "${input.signingAlgorithm}" for resource ${input.identifier} — must be one of ${JWS_ALGORITHMS.join(", ")}. Continuing without an algorithm override.`,
			);
			const { signingAlgorithm: _, ...rest } = input;
			input = rest as typeof input;
		}

		const existing = map.get(input.identifier);
		if (existing) {
			if (mode === "insertOnly") {
				continue;
			}
			if (mode === "merge") {
				const mergedInput: OAuthResourceInput = { ...existing.input };
				for (const [k, v] of Object.entries(input)) {
					if (v !== undefined) {
						(mergedInput as unknown as Record<string, unknown>)[k] = v;
					}
				}
				const resource: OAuthResource = {
					id: mergedInput.identifier,
					...buildSeedRow(mergedInput, now),
				};
				map.set(mergedInput.identifier, {
					input: mergedInput,
					resource,
					validation: existing.validation,
					invalid: existing.invalid,
				});
				continue;
			}
			// mode === "overwrite" replaces with the newer entry below
		}

		const resource: OAuthResource = {
			id: input.identifier,
			...buildSeedRow(input, now),
		};

		map.set(input.identifier, {
			input,
			resource,
			validation: null,
			invalid: false,
		});
	}

	return map;
}

/**
 * Looks up a configured resource entry in memory. If not yet indexed, indexes
 * lazily. Defers and memoizes identifier validation per entry.
 *
 * @internal
 */
export async function getConfiguredResource(
	opts: OAuthOptions<Scope[]>,
	identifier: string,
): Promise<ConfiguredResourceEntry | null> {
	let map = configuredResourceMaps.get(opts);
	if (!map) {
		map = indexConfiguredResources(opts);
	}
	const entry = map.get(identifier);
	if (!entry || entry.invalid) return null;

	if (entry.validation === null) {
		entry.validation = checkIdentifier(opts, identifier)
			.then((check) => {
				if (!check.ok) {
					entry.invalid = true;
					logger.warn(
						`oauth-provider: skipping resource for ${identifier} — ${check.reason}`,
					);
				}
				return check;
			})
			.catch((err) => {
				entry.validation = null;
				throw err;
			});
	}

	const check = await entry.validation;
	if (!check.ok) return null;
	return entry;
}

/**
 * Returns synthetic resources from in-memory config whose identifiers are
 * not present in the given database rows, for the admin list.
 *
 * @internal
 */
export async function getConfiguredResourcesWithoutRows(
	opts: OAuthOptions<Scope[]>,
	rows: OAuthResource[],
): Promise<OAuthResource[]> {
	const rowIdentifiers = new Set(rows.map((r) => r.identifier));
	let map = configuredResourceMaps.get(opts);
	if (!map) {
		map = indexConfiguredResources(opts);
	}
	const result: OAuthResource[] = [];
	for (const [identifier] of map) {
		if (rowIdentifiers.has(identifier)) continue;
		const entry = await getConfiguredResource(opts, identifier);
		if (entry) {
			result.push(Object.assign({}, entry.resource));
		}
	}
	return result;
}

/**
 * Combines a stored database row with in-memory configuration per {@link OAuthOptions.resourceSeedMode}.
 *
 * @internal
 */
export function combineResource(
	row: OAuthResource,
	entry: ConfiguredResourceEntry,
	mode: "insertOnly" | "merge" | "overwrite" = "insertOnly",
): OAuthResource {
	if (mode === "insertOnly") {
		return Object.assign({}, row);
	}

	if (mode === "merge") {
		const combined: OAuthResource = { ...row };
		const input = entry.input;
		if (input.name !== undefined) combined.name = input.name;
		if (input.accessTokenTtl !== undefined) {
			combined.accessTokenTtl = input.accessTokenTtl;
		}
		if (input.refreshTokenTtl !== undefined) {
			combined.refreshTokenTtl = input.refreshTokenTtl;
		}
		if (input.signingAlgorithm !== undefined) {
			combined.signingAlgorithm = input.signingAlgorithm;
		}
		if (input.signingKeyId !== undefined) {
			combined.signingKeyId = input.signingKeyId;
		}
		if (input.allowedScopes !== undefined) {
			combined.allowedScopes = input.allowedScopes;
		}
		if (input.customClaims !== undefined) {
			combined.customClaims = input.customClaims;
		}
		if (input.dpopBoundAccessTokensRequired !== undefined) {
			combined.dpopBoundAccessTokensRequired =
				input.dpopBoundAccessTokensRequired;
		}
		if (input.disabled !== undefined) combined.disabled = input.disabled;
		if (input.metadata !== undefined) {
			combined.metadata = omitDeleted(input.metadata);
		}
		return combined;
	}

	// overwrite
	const combined: OAuthResource = {
		...entry.resource,
		id: row.id,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		policyVersion: row.policyVersion ?? entry.resource.policyVersion,
		metadata: omitDeleted(entry.resource.metadata),
	};
	return combined;
}

/**
 * Looks up an {@link OAuthResource} by `identifier`, consulting the in-process
 * cache when the identifier is in {@link OAuthOptions.cachedResources}.
 *
 * Combines database rows with in-memory configuration per {@link OAuthOptions.resourceSeedMode}.
 * Returns a defensive copy so callers can't mutate cached state.
 *
 * @internal
 */
export async function getResource(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	identifier: string,
): Promise<OAuthResource | null> {
	let dbResource: OAuthResource | null = null;
	if (opts.cachedResources?.has(identifier)) {
		const cached = resourceCache.get(identifier);
		if (cached) {
			dbResource = Object.assign({}, cached);
		}
	}

	if (!dbResource) {
		const row = await ctx.context.adapter.findOne<OAuthResource>({
			model: opts.schema?.oauthResource?.modelName ?? "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		if (row) {
			if (opts.cachedResources?.has(identifier)) {
				resourceCache.set(identifier, Object.assign({}, row));
			}
			dbResource = row;
		}
	}

	if (dbResource && isResourceTombstoned(dbResource)) {
		return null;
	}

	const configured = await getConfiguredResource(opts, identifier);
	if (!dbResource && !configured) {
		return null;
	}

	if (dbResource && !configured) {
		return Object.assign({}, dbResource);
	}
	if (!dbResource && configured) {
		return Object.assign({}, configured.resource);
	}

	return combineResource(
		dbResource!,
		configured!,
		opts.resourceSeedMode ?? "insertOnly",
	);
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
 * Builds the row payload sent to the adapter for an insert. All policy
 * columns default to `null` (= inherit plugin default at issuance time)
 * when the input doesn't specify a value.
 */
function buildSeedRow(input: OAuthResourceInput, now: Date) {
	return {
		identifier: input.identifier,
		name: defaultName(input),
		accessTokenTtl: input.accessTokenTtl ?? null,
		refreshTokenTtl: input.refreshTokenTtl ?? null,
		signingAlgorithm: input.signingAlgorithm ?? null,
		signingKeyId: input.signingKeyId ?? null,
		// FIXME(#11725): same null limit as buildResourceRow in
		// oauthResource/endpoints.ts.
		allowedScopes: input.allowedScopes ?? null,
		customClaims: input.customClaims ?? null,
		dpopBoundAccessTokensRequired: input.dpopBoundAccessTokensRequired ?? false,
		disabled: input.disabled ?? false,
		policyVersion: 1,
		metadata: omitDeleted(input.metadata),
		createdAt: now,
		updatedAt: now,
	};
}

const adapterLocks = new WeakMap<object, Map<string, Promise<unknown>>>();

function getBaseAdapter(adapter: object): object {
	let current: unknown = adapter;
	while (current && typeof current === "object") {
		const candidate = current as {
			baseAdapter?: unknown;
			adapter?: unknown;
		};
		if (candidate.baseAdapter && typeof candidate.baseAdapter === "object") {
			current = candidate.baseAdapter;
		} else if (
			candidate.adapter &&
			typeof candidate.adapter === "object" &&
			("findOne" in candidate.adapter || "create" in candidate.adapter)
		) {
			current = candidate.adapter;
		} else {
			break;
		}
	}
	return (current as object) ?? adapter;
}

export function withResourceInsertLock<T>(
	adapter: object,
	lockKey: string,
	task: () => Promise<T>,
): Promise<T> {
	const baseAdapter = getBaseAdapter(adapter);
	let locks = adapterLocks.get(baseAdapter);
	if (!locks) {
		locks = new Map<string, Promise<unknown>>();
		adapterLocks.set(baseAdapter, locks);
	}
	const previous = locks.get(lockKey) ?? Promise.resolve();
	const run = previous.then(task, task);
	const tracked = run.finally(() => {
		if (locks!.get(lockKey) === tracked) {
			locks!.delete(lockKey);
		}
	});
	locks.set(lockKey, tracked);
	return tracked;
}

/**
 * Creates a database row for a configured resource lazily and idempotently.
 * Called before client linkage writes or when an admin updates a row-less
 * configured resource.
 *
 * @internal
 */
export async function ensureResourceRow(
	ctx: GenericEndpointContext | { context: AuthContext } | AuthContext,
	opts: OAuthOptions<Scope[]>,
	identifier: string,
): Promise<OAuthResource | null> {
	const authContext = "context" in ctx ? ctx.context : (ctx as AuthContext);
	const rawAdapter =
		("baseAdapter" in authContext &&
		authContext.baseAdapter &&
		typeof authContext.baseAdapter === "object"
			? authContext.baseAdapter
			: undefined) ??
		("context" in ctx && ctx.context?.adapter
			? ctx.context.adapter
			: authContext.adapter);
	const adapter = (getBaseAdapter(rawAdapter as object) ??
		rawAdapter) as typeof authContext.adapter;
	const modelName = opts.schema?.oauthResource?.modelName ?? "oauthResource";
	const where = [{ field: "identifier", value: identifier }];

	const existing = await adapter.findOne<OAuthResource>({
		model: modelName,
		where,
	});
	if (existing) {
		if (isResourceTombstoned(existing)) {
			return null;
		}
		return existing;
	}

	const entry = await getConfiguredResource(opts, identifier);
	if (!entry) {
		return null;
	}

	const adapterKey = adapter as object;
	const lockKey = `${modelName}:${identifier}`;

	return withResourceInsertLock(adapterKey, lockKey, async () => {
		const raced = await adapter.findOne<OAuthResource>({
			model: modelName,
			where,
		});
		if (raced) {
			if (isResourceTombstoned(raced)) {
				return null;
			}
			return raced;
		}

		const now = new Date();
		const data = buildSeedRow(entry.input, now);

		try {
			const created = await adapter.create<OAuthResource>({
				model: modelName,
				data,
			});
			invalidateResourceCache(identifier);
			if (created) return created;
			const reRead = await adapter.findOne<OAuthResource>({
				model: modelName,
				where,
			});
			return reRead;
		} catch (err) {
			const winner = await adapter
				.findOne<OAuthResource>({ model: modelName, where })
				.catch(() => null);
			if (winner) {
				invalidateResourceCache(identifier);
				if (isResourceTombstoned(winner)) {
					return null;
				}
				return winner;
			}
			throw err;
		}
	});
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
