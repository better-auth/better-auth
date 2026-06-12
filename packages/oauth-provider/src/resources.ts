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
 * Builds a deterministic primary-key value for an `oauthClientResource`
 * row. Used so the implicit PK uniqueness constraint enforces the composite
 * `(clientId, resourceId)` uniqueness that Better Auth's schema layer
 * cannot declare directly — making client-resource links idempotent across
 * the admin link endpoint and Dynamic Client Registration.
 *
 * The `::` separator is collision-free: client_id is a URL-safe random
 * string (no `::`) and resource identifier is an RFC 8707 absolute URI
 * (a bare `::` would be a malformed IPv6 host the validator rejects).
 *
 * @see comment block in `schema.ts` on `oauthClientResource` for the full
 * rationale.
 * @internal
 */
export function buildClientResourceLinkId(
	clientId: string,
	resourceId: string,
): string {
	return `${clientId}::${resourceId}`;
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
	// Strict default: must parse as absolute URI, must not have a fragment.
	let url: URL;
	try {
		url = new URL(identifier);
	} catch {
		return {
			ok: false,
			reason: `resource identifier ${identifier} must be an absolute URI (RFC 8707 §2)`,
		};
	}
	if (url.hash) {
		return {
			ok: false,
			reason: `resource identifier ${identifier} must not contain a URI fragment (RFC 8707 §2)`,
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
 * Claim names reserved by RFC 9068 §2.2 for OAuth 2.0 JWT-formatted access
 * tokens. Customizations (`customClaims` on a resource row, or the existing
 * `customAccessTokenClaims` plugin option) cannot override these — the AS is
 * the only source of truth for issuer identity, subject, audience claim, lifetime,
 * and the token's stable ID.
 *
 * Reserved values found in untrusted input are stripped at issuance and
 * a `warn` log is emitted (never silently dropped — surfacing the override
 * attempt is more important than minimum log noise).
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
 * Returns a copy of `claims` with reserved RFC 9068 names stripped. Logs a
 * warning naming the stripped keys when any were present. Callers pass the
 * returned record into the JWT payload.
 *
 * Stable iteration order (Object.entries) is preserved so token-debug logs
 * are reproducible across runs.
 *
 * @internal
 */
export function stripReservedClaims(
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
			`oauth-provider: stripped reserved RFC 9068 claim name(s) from customClaims: ${stripped.join(", ")}. The AS owns these claim values.`,
		);
	}
	return safe;
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
	 * Merged custom claims across requested resources. Reserved RFC 9068
	 * claim names are stripped — callers don't need to re-strip.
	 */
	customClaims: Record<string, unknown>;
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
const userInfoResource = (baseURL: string) => `${baseURL}/oauth2/userinfo`;

/**
 * Re-parses a request's raw `application/x-www-form-urlencoded` body to
 * recover every value of the repeated `resource` parameter (RFC 8707 §2).
 *
 * Workaround for better-call's form-body parser (better-call ≤1.3.5), which
 * collapses repeated form keys with last-write-wins. A client sending
 * `resource=https://a&resource=https://b` would otherwise arrive in the
 * handler as `{ resource: "https://b" }`, silently narrowing the issued
 * token's `aud` to a single resource.
 *
 * Returns the full ordered list when the body is form-encoded and contains
 * any `resource` entries; `undefined` otherwise. Caller MUST enable
 * `cloneRequest: true` on the endpoint — the body stream is read here a
 * second time, and that only works when better-call cloned the request
 * before its own parse.
 *
 * Note: the URL-encoded body path is the only one affected. The query-string
 * path (e.g. `/oauth2/authorize?resource=…&resource=…`) is parsed by the
 * router itself, which DOES array-promote duplicate keys correctly.
 *
 * @internal
 */
export async function extractRepeatedResourceFromForm(
	request: Request,
): Promise<string[] | undefined> {
	const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
	if (!contentType.includes("application/x-www-form-urlencoded")) {
		return undefined;
	}
	let text: string;
	try {
		text = await request.text();
	} catch {
		return undefined;
	}
	if (!text) return undefined;
	const params = new URLSearchParams(text);
	const values = params.getAll("resource").filter((value) => value.length > 0);
	return values.length > 0 ? values : undefined;
}

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
 * 7. Merge per-resource `customClaims`, strip reserved claim names.
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
			customClaims: {},
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

	// Per-resource custom claims: merge in declared order (later resources
	// win on key collisions). Reserved-claim stripping is applied after the
	// merge so the AS-owned claims are protected regardless of source.
	const mergedClaims: Record<string, unknown> = {};
	for (const row of resolved) {
		if (row.customClaims && typeof row.customClaims === "object") {
			Object.assign(mergedClaims, row.customClaims);
		}
	}
	const safeClaims = stripReservedClaims(mergedClaims);

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
		customClaims: safeClaims,
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

/**
 * Looks up an {@link OAuthResource} by `identifier`, consulting the in-process
 * cache when the identifier is in {@link OAuthOptions.cachedResources}.
 *
 * Triggers the lazy seed via {@link seedResourcesOnce} on first call — this
 * is the safety net for deployments where migrations run after plugin init
 * (so seeding at init couldn't see the table yet). The seed is idempotent
 * and coalesced, so the cost is paid only once per process.
 *
 * Returns a defensive copy so callers can't mutate cached state.
 *
 * @internal
 */
export async function getResource(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	identifier: string,
): Promise<OAuthResource | null> {
	// Lazy-seed safety net for the migration-ordering case.
	await seedResourcesOnce(ctx.context, opts);

	if (opts.cachedResources?.has(identifier)) {
		const cached = resourceCache.get(identifier);
		if (cached) return Object.assign({}, cached);
	}

	const dbResource = await ctx.context.adapter.findOne<OAuthResource>({
		model: opts.schema?.oauthResource?.modelName ?? "oauthResource",
		where: [{ field: "identifier", value: identifier }],
	});

	if (dbResource && opts.cachedResources?.has(identifier)) {
		resourceCache.set(identifier, Object.assign({}, dbResource));
	}
	return dbResource;
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
 * Builds the row payload sent to the adapter for a seed insert. All policy
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
		allowedScopes: input.allowedScopes ?? null,
		customClaims: input.customClaims ?? null,
		disabled: input.disabled ?? false,
		policyVersion: 1,
		metadata: input.metadata ?? null,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Builds the partial update payload when re-seeding an existing row.
 *
 * - `overwrite` mode replaces every policy column with the input value
 *   (omitted fields fall back to `null` to clear stale state).
 * - `merge` mode updates only fields present in the input — admin edits to
 *   other fields are preserved.
 */
function buildSeedUpdate(
	input: OAuthResourceInput,
	mode: "merge" | "overwrite",
	now: Date,
): Record<string, unknown> {
	if (mode === "overwrite") {
		const row = buildSeedRow(input, now);
		// Don't overwrite identifier (it's the key we matched on) or createdAt
		// (preserves original insertion timestamp).
		const { identifier: _identifier, createdAt: _createdAt, ...rest } = row;
		return rest;
	}
	const update: Record<string, unknown> = { updatedAt: now };
	if (input.name !== undefined) update.name = input.name;
	if (input.accessTokenTtl !== undefined)
		update.accessTokenTtl = input.accessTokenTtl;
	if (input.refreshTokenTtl !== undefined)
		update.refreshTokenTtl = input.refreshTokenTtl;
	if (input.signingAlgorithm !== undefined)
		update.signingAlgorithm = input.signingAlgorithm;
	if (input.signingKeyId !== undefined)
		update.signingKeyId = input.signingKeyId;
	if (input.allowedScopes !== undefined)
		update.allowedScopes = input.allowedScopes;
	if (input.customClaims !== undefined)
		update.customClaims = input.customClaims;
	if (input.disabled !== undefined) update.disabled = input.disabled;
	if (input.metadata !== undefined) update.metadata = input.metadata;
	return update;
}

/**
 * Pattern matched against adapter errors to detect the "table not yet
 * created" case — i.e. migrations haven't been run. When matched, the
 * caller treats the seed as deferred (will retry on first resource access).
 *
 * Covers SQLite ("no such table"), Postgres ("relation X does not exist"),
 * and MySQL ("Table X does not exist" / contracted form).
 */
// cspell:ignore-next-line doesn
const MISSING_TABLE_PATTERN =
	/no such table|relation.*does not exist|table.*does(?: not|n[''']?t) exist/i;

interface SeedState {
	completed: boolean;
	promise: Promise<void> | null;
}

/**
 * Per-adapter state for the lazy-seed path. A module-level boolean would let
 * one Better Auth instance suppress seeding for every later instance in the same
 * process. Endpoint `AuthContext` objects are not guaranteed to be stable across
 * requests, so keying by the adapter keeps one seed state per backing store.
 */
let seedStates = new WeakMap<object, SeedState>();

function getSeedState(ctx: AuthContext): SeedState {
	const key = ctx.adapter as object;
	const existing = seedStates.get(key);
	if (existing) return existing;
	const created: SeedState = { completed: false, promise: null };
	seedStates.set(key, created);
	return created;
}

/**
 * Resets the lazy-seed state. Used by tests to force re-seeding between
 * cases — should not be called from production code.
 *
 * @internal
 */
export function resetSeedStateForTests(): void {
	seedStates = new WeakMap<object, SeedState>();
}

/**
 * Seeds `oauthResource` rows from plugin config.
 *
 * Behavior is controlled by {@link OAuthOptions.resourceSeedMode}:
 *
 * - `"insertOnly"` (default, safe): inserts rows whose `identifier` is not
 *   already present. Existing rows are untouched — admin edits via CRUD
 *   are never reverted on restart.
 * - `"merge"`: inserts missing rows; updates only specified fields for
 *   existing rows. Useful when config holds the "preferred defaults" but
 *   admins customize per-row.
 * - `"overwrite"`: inserts missing rows; replaces every policy column on
 *   existing rows with the config value (omitted fields → null). Use only
 *   when config is the single source of truth.
 *
 * Race-safety: the `identifier` column carries a UNIQUE constraint, so two
 * processes booting simultaneously can each attempt the insert — one wins,
 * the other catches the constraint error and treats it as a no-op.
 *
 * Migration ordering: at plugin `init` time, tables may not exist yet
 * (Better Auth's test harness, and many deployment setups, run migrations
 * after auth construction). Seeding tolerates "no such table" errors and
 * defers — the lazy {@link seedResourcesOnce} path picks up the work on
 * the first resource access.
 *
 * Idempotent: safe to call multiple times.
 *
 * @internal
 */
export async function seedResources(
	ctx: AuthContext,
	opts: OAuthOptions<Scope[]>,
): Promise<void> {
	const inputs = collectResourceInputs(opts);
	if (inputs.length === 0) return;

	const mode = opts.resourceSeedMode ?? "insertOnly";
	const modelName = opts.schema?.oauthResource?.modelName ?? "oauthResource";

	for (const rawInput of inputs) {
		// Apply the same RFC 8707 §2 identifier validation as the admin CRUD
		// path. A typo in `resources` config should not silently produce a row
		// the AS will later refuse to issue against — but it shouldn't brick
		// plugin init either. Warn and skip the offending entry.
		const check = await checkIdentifier(opts, rawInput.identifier);
		if (!check.ok) {
			logger.warn(
				`oauth-provider: skipping resource seed for ${rawInput.identifier} — ${check.reason}`,
			);
			continue;
		}
		// Parity with the admin-CRUD zod gate (`z.enum(JWS_ALGORITHMS)`):
		// reject bad `signingAlgorithm` values from config at seed time so
		// they never reach signJWT. Strip-and-warn rather than throw so a
		// single typo doesn't brick init for every other resource entry.
		let input = rawInput;
		if (
			input.signingAlgorithm != null &&
			!JWS_ALGORITHM_SET.has(input.signingAlgorithm)
		) {
			logger.warn(
				`oauth-provider: dropping unsupported signingAlgorithm "${input.signingAlgorithm}" for resource ${input.identifier} — must be one of ${JWS_ALGORITHMS.join(", ")}. Continuing without an algorithm override.`,
			);
			// Strip the bad algorithm so downstream policy treats it as "inherit
			// plugin default." Cast away `null` in the type since the input
			// surface uses optional fields (absent = inherit).
			const { signingAlgorithm: _, ...rest } = input;
			input = rest as typeof input;
		}
		let existing: OAuthResource | null;
		try {
			existing = await ctx.adapter.findOne<OAuthResource>({
				model: modelName,
				where: [{ field: "identifier", value: input.identifier }],
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (MISSING_TABLE_PATTERN.test(message)) {
				logger.debug(
					"oauth-provider: oauthResource table not yet created; deferring resource seed to first access.",
				);
				return;
			}
			throw err;
		}
		const now = new Date();

		if (!existing) {
			try {
				await ctx.adapter.create({
					model: modelName,
					data: buildSeedRow(input, now),
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				// Race with a concurrent boot — another process inserted between
				// our findOne and create. The UNIQUE constraint protects us; treat
				// the conflict as a no-op so init doesn't fail.
				if (/unique|duplicate|UNIQUE/i.test(message)) {
					logger.debug(
						`oauth-provider: resource ${input.identifier} already inserted by a concurrent process — skipping.`,
					);
					continue;
				}
				if (MISSING_TABLE_PATTERN.test(message)) {
					logger.debug(
						"oauth-provider: oauthResource table not yet created; deferring resource seed to first access.",
					);
					return;
				}
				throw err;
			}
			continue;
		}

		if (mode === "insertOnly") continue;

		await ctx.adapter.update({
			model: modelName,
			where: [{ field: "identifier", value: input.identifier }],
			update: buildSeedUpdate(input, mode, now),
		});
	}
}

/**
 * Idempotent, coalesced wrapper around {@link seedResources} for the
 * lazy-seed path. Safe to call from every resource lookup — the first call
 * runs the seed, concurrent calls await the same promise, and subsequent
 * calls become no-ops.
 *
 * The endpoint context shape (`{ context: AuthContext }`) is what
 * `getResource` receives, so this is a convenience overload that unwraps
 * for callers.
 *
 * @internal
 */
export async function seedResourcesOnce(
	ctx: AuthContext,
	opts: OAuthOptions<Scope[]>,
): Promise<void> {
	// Explicit boolean / null comparisons keep Biome's `noMisusedPromises`
	// rule happy — these are flag variables, not Promise checks.
	const state = getSeedState(ctx);
	if (state.completed === true) return;
	if (state.promise !== null) return state.promise;
	state.promise = seedResources(ctx, opts)
		.then(() => {
			state.completed = true;
		})
		.catch((err) => {
			// Reset so a later call can retry — transient errors shouldn't
			// permanently disable seeding for the process.
			state.promise = null;
			throw err;
		});
	return state.promise;
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
