import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import type {
	ClientDiscovery,
	OAuthClaimExtensionInput,
	OAuthClientAuthenticationStrategy,
	OAuthMetadataExtensionInput,
	OAuthOptions,
	OAuthProviderExtension,
	OAuthUserInfoExtensionInput,
	Scope,
} from "./types";
import type { Awaitable } from "./types/helpers";
import type {
	AuthMethod,
	AuthServerMetadata,
	BuiltInGrantType,
	GrantType,
	OIDCMetadata,
	TokenEndpointAuthMethod,
} from "./types/oauth";

const DEFAULT_GRANT_TYPES = [
	"authorization_code",
	"client_credentials",
	"refresh_token",
] as const satisfies BuiltInGrantType[];

const BUILT_IN_CONFIDENTIAL_AUTH_METHODS = [
	"client_secret_basic",
	"client_secret_post",
	"private_key_jwt",
] as const satisfies AuthMethod[];

const RESERVED_TOKEN_ENDPOINT_AUTH_METHODS = [
	"none",
	...BUILT_IN_CONFIDENTIAL_AUTH_METHODS,
] as const satisfies TokenEndpointAuthMethod[];

const RESERVED_TOKEN_ENDPOINT_AUTH_METHOD_SET = new Set<string>(
	RESERVED_TOKEN_ENDPOINT_AUTH_METHODS,
);

function assertNonEmptyExtensionValue(name: string, value: string) {
	if (value.trim().length > 0) return;
	throw new BetterAuthError(`OAuth Provider extension ${name} cannot be empty`);
}

function assertAbsoluteUri(name: string, value: string) {
	assertNonEmptyExtensionValue(name, value);
	let url: URL | undefined;
	try {
		url = new URL(value);
	} catch {
		url = undefined;
	}
	if (url?.protocol) return;
	throw new BetterAuthError(
		`OAuth Provider extension ${name} must be an absolute URI: ${value}`,
	);
}

function assertExtensionGrantType(grantType: string) {
	assertAbsoluteUri("grant type", grantType);
}

function assertExtensionTokenEndpointAuthMethod(method: string) {
	assertNonEmptyExtensionValue("token_endpoint_auth_method", method);
	if (!RESERVED_TOKEN_ENDPOINT_AUTH_METHOD_SET.has(method)) return;
	throw new BetterAuthError(
		`OAuth Provider extension token_endpoint_auth_method is reserved: ${method}`,
	);
}

function assertExtensionClientAssertionType(assertionType: string) {
	assertAbsoluteUri("client_assertion_type", assertionType);
	if (assertionType !== CLIENT_ASSERTION_TYPE) return;
	throw new BetterAuthError(
		`OAuth Provider extension client_assertion_type is reserved: ${assertionType}`,
	);
}

interface ExtensionKeys {
	grantTypes: string[];
	authMethods: string[];
	assertionTypes: string[];
}

/**
 * Validates one extension's dispatched keys (grant types, auth methods,
 * assertion types) and returns them for the cross-extension disjointness check.
 * Throws on a non-absolute grant/assertion URI, a reserved auth-method name, or
 * an empty assertion-type list.
 */
function collectExtensionKeys(
	extension: OAuthProviderExtension,
): ExtensionKeys {
	const grantTypes = Object.keys(extension.grants ?? {});
	for (const grantType of grantTypes) {
		assertExtensionGrantType(grantType);
	}
	const authMethods: string[] = [];
	const assertionTypes: string[] = [];
	for (const [method, strategy] of Object.entries(
		extension.clientAuthentication ?? {},
	)) {
		assertExtensionTokenEndpointAuthMethod(method);
		authMethods.push(method);
		const methodAssertionTypes = strategy.assertionTypes ?? [method];
		if (methodAssertionTypes.length === 0) {
			throw new BetterAuthError(
				`OAuth Provider extension client_assertion_type list cannot be empty for ${method}`,
			);
		}
		for (const assertionType of methodAssertionTypes) {
			assertExtensionClientAssertionType(assertionType);
			assertionTypes.push(assertionType);
		}
	}
	return { grantTypes, authMethods, assertionTypes };
}

function assertNoDuplicateAcrossExtensions(label: string, values: string[]) {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) {
			throw new BetterAuthError(
				`OAuth Provider extensions register ${label} "${value}" more than once. Extension contributions must be disjoint.`,
			);
		}
		seen.add(value);
	}
}

/**
 * Validates every extension and rejects two extensions registering the same
 * grant type, auth method, or assertion type: otherwise the first would win and
 * the second be silently unreachable. Runs at setup over the whole list;
 * extensions number in the single digits, so a full re-scan per registration is
 * cheaper than the bookkeeping to cache it.
 */
export function validateOAuthProviderExtensions(
	extensions: OAuthProviderExtension[] | undefined,
) {
	const keys = (extensions ?? []).map(collectExtensionKeys);
	assertNoDuplicateAcrossExtensions(
		"grant type",
		keys.flatMap((k) => k.grantTypes),
	);
	assertNoDuplicateAcrossExtensions(
		"token_endpoint_auth_method",
		keys.flatMap((k) => k.authMethods),
	);
	assertNoDuplicateAcrossExtensions(
		"client_assertion_type",
		keys.flatMap((k) => k.assertionTypes),
	);
}

function getOAuthProviderExtensions(
	opts: OAuthOptions<Scope[]>,
): OAuthProviderExtension[] {
	return opts.extensions ?? [];
}

/**
 * Flattens the client-id discovery sources contributed by every registered
 * extension into a single ordered list. `getClient()` consults them in order;
 * the metadata endpoints merge their `discoveryMetadata`.
 */
export function getClientDiscoveries(
	opts: OAuthOptions<Scope[]>,
): ClientDiscovery[] {
	return getOAuthProviderExtensions(opts).flatMap((extension) => {
		const discovery = extension.clientDiscovery;
		if (!discovery) return [];
		return Array.isArray(discovery) ? discovery : [discovery];
	});
}

/**
 * Registers an {@link OAuthProviderExtension} with the OAuth Provider plugin
 * from a companion plugin's `init()` hook. An extension can add token grants,
 * assertion-based client authentication methods, additive discovery metadata,
 * access-token / ID-token / UserInfo claims, and client-id discovery, without
 * forking provider core.
 *
 * Call this once, at `init()` time. It is idempotent in the same `extension`
 * object, so re-running a plugin's `init()` (for example when one plugin factory
 * result is shared across two `betterAuth()` instances) does not register it
 * twice. It throws if the oauth-provider plugin is not installed, if a grant
 * type or assertion type is not an absolute URI, if a client authentication
 * method reuses a built-in name, or if the extension registers a grant type,
 * auth method, or assertion type that another extension already registered
 * (contributions must be disjoint).
 *
 * @example
 * ```ts
 * init(ctx) {
 *   extendOAuthProvider(ctx, {
 *     grants: { "urn:example:grant": async ({ tools }) => tools.issueTokens(...) },
 *   });
 * }
 * ```
 */
export function extendOAuthProvider(
	ctx: AuthContext,
	extension: OAuthProviderExtension,
) {
	const provider = ctx.getPlugin("oauth-provider");
	if (!provider) {
		throw new BetterAuthError(
			"extendOAuthProvider requires the oauth-provider plugin.",
		);
	}
	const existing = provider.options.extensions ?? [];
	if (existing.includes(extension)) return;
	const extensions = [...existing, extension];
	validateOAuthProviderExtensions(extensions);
	provider.options.extensions = extensions;
}

function getExtensionGrantTypes(opts: OAuthOptions<Scope[]>): GrantType[] {
	return getOAuthProviderExtensions(opts).flatMap((extension) =>
		Object.keys(extension.grants ?? {}),
	);
}

export function getSupportedGrantTypes(
	opts: OAuthOptions<Scope[]>,
): GrantType[] {
	return Array.from(
		new Set<GrantType>([
			...(opts.grantTypes ?? DEFAULT_GRANT_TYPES),
			...getExtensionGrantTypes(opts),
		]),
	);
}

export function getExtensionGrantHandler(
	opts: OAuthOptions<Scope[]>,
	grantType: GrantType,
) {
	for (const extension of getOAuthProviderExtensions(opts)) {
		const handler = extension.grants?.[grantType];
		if (handler) return handler;
	}
	return undefined;
}

function getExtensionTokenEndpointAuthMethods(
	opts: OAuthOptions<Scope[]>,
): TokenEndpointAuthMethod[] {
	return getOAuthProviderExtensions(opts).flatMap((extension) =>
		Object.keys(extension.clientAuthentication ?? {}),
	);
}

/**
 * Confidential and extension client-authentication methods the provider
 * supports. Pass `includeNone` to prepend `"none"` for the token endpoint and
 * DCR, where public clients are allowed; the introspection and revocation
 * endpoints, which never accept public clients, omit it (the default).
 */
export function getSupportedAuthMethods(
	opts: OAuthOptions<Scope[]>,
	settings?: { includeNone?: boolean },
): TokenEndpointAuthMethod[] {
	return Array.from(
		new Set<TokenEndpointAuthMethod>([
			...(settings?.includeNone ? (["none"] as TokenEndpointAuthMethod[]) : []),
			...BUILT_IN_CONFIDENTIAL_AUTH_METHODS,
			...getExtensionTokenEndpointAuthMethods(opts),
		]),
	);
}

export function isExtensionTokenEndpointAuthMethod(
	opts: OAuthOptions<Scope[]>,
	method: TokenEndpointAuthMethod | undefined,
) {
	return method
		? getExtensionTokenEndpointAuthMethods(opts).includes(method)
		: false;
}

export function getExtensionClientAuthenticationStrategy(
	opts: OAuthOptions<Scope[]>,
	assertionType: string,
):
	| {
			method: TokenEndpointAuthMethod;
			strategy: OAuthClientAuthenticationStrategy;
	  }
	| undefined {
	if (assertionType === CLIENT_ASSERTION_TYPE) return undefined;
	for (const extension of getOAuthProviderExtensions(opts)) {
		const strategies = extension.clientAuthentication ?? {};
		for (const [method, strategy] of Object.entries(strategies)) {
			const assertionTypes = strategy.assertionTypes ?? [method];
			if (assertionTypes.includes(assertionType)) {
				return { method, strategy };
			}
		}
	}
	return undefined;
}

/**
 * Merges the discovery-document fields contributed by every registered
 * extension into `document`. The provider owns every key it already wrote, and
 * the first extension to contribute a given key wins, so an extension can add
 * fields but never override authorization-server core.
 */
export function applyOAuthProviderMetadataExtensions<
	T extends AuthServerMetadata | OIDCMetadata,
>(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	type: OAuthMetadataExtensionInput["type"],
	document: T,
): T {
	const next: Record<string, unknown> = { ...document };
	for (const extension of getOAuthProviderExtensions(opts)) {
		const contribution = extension.metadata?.({ ctx, opts, type, document });
		for (const [key, value] of Object.entries(contribution ?? {})) {
			if (!(key in next)) {
				next[key] = value;
			}
		}
	}
	return next as T;
}

async function collectClaims(
	opts: OAuthOptions<Scope[]>,
	run: (
		extension: OAuthProviderExtension,
	) => Awaitable<Record<string, unknown> | undefined>,
) {
	const claims: Record<string, unknown> = {};
	// First contributor wins a key, matching metadata extensions. Extensions are
	// expected to contribute disjoint claims, so a collision is a
	// misconfiguration: keep the first value and warn rather than silently
	// shadow the later contributor.
	for (const extension of getOAuthProviderExtensions(opts)) {
		const contribution = (await run(extension)) ?? {};
		for (const [key, value] of Object.entries(contribution)) {
			if (key in claims) {
				logger.warn(
					`oauth-provider: two extensions contributed the claim "${key}"; keeping the first-registered value.`,
				);
				continue;
			}
			claims[key] = value;
		}
	}
	return claims;
}

export function collectExtensionAccessTokenClaims(
	opts: OAuthOptions<Scope[]>,
	input: OAuthClaimExtensionInput,
) {
	return collectClaims(opts, (extension) =>
		extension.claims?.accessToken?.(input),
	);
}

export function collectExtensionIdTokenClaims(
	opts: OAuthOptions<Scope[]>,
	input: OAuthClaimExtensionInput,
) {
	return collectClaims(opts, (extension) => extension.claims?.idToken?.(input));
}

export function collectExtensionUserInfoClaims(
	opts: OAuthOptions<Scope[]>,
	input: OAuthUserInfoExtensionInput,
) {
	return collectClaims(opts, (extension) =>
		extension.claims?.userInfo?.(input),
	);
}

/**
 * Whether any registered extension contributes UserInfo claims. Lets the
 * UserInfo endpoint skip loading the client when nothing needs it.
 */
export function hasUserInfoClaimExtension(
	opts: OAuthOptions<Scope[]>,
): boolean {
	return getOAuthProviderExtensions(opts).some(
		(extension) => extension.claims?.userInfo,
	);
}
