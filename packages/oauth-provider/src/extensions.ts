import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import type { oauthProvider } from "./oauth";
import type {
	ClientDiscovery,
	OAuthClaimContributionInput,
	OAuthClientAuthenticationStrategy,
	OAuthMetadataContributionInput,
	OAuthOptions,
	OAuthProviderExtension,
	OAuthUserInfoContributionInput,
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

function dedupe<T extends string>(values: T[]): T[] {
	return Array.from(new Set(values));
}

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

// Caches the registered keys of each validated extension. Extensions are read
// once at setup and treated as immutable after, so per-extension validation and
// the cross-extension disjointness check below never re-read their getters.
const validatedExtensions = new WeakMap<
	OAuthProviderExtension<Scope[]>,
	ExtensionKeys
>();

function validateOAuthProviderExtension(
	extension: OAuthProviderExtension<Scope[]>,
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

export function validateOAuthProviderExtensions(
	extensions: OAuthProviderExtension<Scope[]>[] | undefined,
) {
	const all = extensions ?? [];
	for (const extension of all) {
		if (validatedExtensions.has(extension)) continue;
		validatedExtensions.set(
			extension,
			validateOAuthProviderExtension(extension),
		);
	}
	// Reject two extensions registering the same grant type, auth method, or
	// assertion type: otherwise the first wins and the second is silently
	// unreachable. Uses the keys cached at first validation.
	const keysOf = (extension: OAuthProviderExtension<Scope[]>) =>
		validatedExtensions.get(extension);
	assertNoDuplicateAcrossExtensions(
		"grant type",
		all.flatMap((extension) => keysOf(extension)?.grantTypes ?? []),
	);
	assertNoDuplicateAcrossExtensions(
		"token_endpoint_auth_method",
		all.flatMap((extension) => keysOf(extension)?.authMethods ?? []),
	);
	assertNoDuplicateAcrossExtensions(
		"client_assertion_type",
		all.flatMap((extension) => keysOf(extension)?.assertionTypes ?? []),
	);
}

function getOAuthProviderExtensions(
	opts: OAuthOptions<Scope[]>,
): OAuthProviderExtension<Scope[]>[] {
	return opts.extensions ?? [];
}

/**
 * Flattens the client-id discovery sources contributed by every registered
 * extension into a single ordered list. `getClient()` consults them in order;
 * the metadata endpoints merge their `discoveryMetadata`.
 */
export function getClientDiscoveries(
	opts: OAuthOptions<Scope[]>,
): ClientDiscovery<Scope[]>[] {
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
 * and access-token, ID-token, or UserInfo claims, without forking provider core.
 *
 * Call this once, at `init()` time. It throws if the oauth-provider plugin is
 * not installed, if a grant type or assertion type is not an absolute URI, if a
 * client authentication method reuses a built-in name, or if the extension
 * registers a grant type, auth method, or assertion type that another extension
 * already registered (contributions must be disjoint).
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
	extension: OAuthProviderExtension<Scope[]>,
) {
	const provider = ctx.getPlugin("oauth-provider") satisfies ReturnType<
		typeof oauthProvider
	> | null;
	if (!provider) {
		throw new BetterAuthError(
			"extendOAuthProvider requires the oauth-provider plugin.",
		);
	}
	const extensions = [...(provider.options.extensions ?? []), extension];
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
	return dedupe([
		...(opts.grantTypes ?? DEFAULT_GRANT_TYPES),
		...getExtensionGrantTypes(opts),
	]);
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

export function getSupportedTokenEndpointAuthMethods(
	opts: OAuthOptions<Scope[]>,
	settings?: { includeNone?: boolean },
): TokenEndpointAuthMethod[] {
	return dedupe([
		...(settings?.includeNone ? (["none"] as TokenEndpointAuthMethod[]) : []),
		...BUILT_IN_CONFIDENTIAL_AUTH_METHODS,
		...getExtensionTokenEndpointAuthMethods(opts),
	]);
}

export function getSupportedEndpointAuthMethods(
	opts: OAuthOptions<Scope[]>,
): AuthMethod[] {
	return dedupe([
		...BUILT_IN_CONFIDENTIAL_AUTH_METHODS,
		...getExtensionTokenEndpointAuthMethods(opts),
	]);
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
			strategy: OAuthClientAuthenticationStrategy<Scope[]>;
	  }
	| undefined {
	const extensions = getOAuthProviderExtensions(opts);
	if (assertionType === CLIENT_ASSERTION_TYPE) return undefined;
	for (const extension of extensions) {
		const strategies = extension.clientAuthentication ?? {};
		for (const [method, strategy] of Object.entries(strategies)) {
			const assertionTypes = strategy.assertionTypes ?? [method];
			if (assertionTypes.includes(assertionType)) {
				return {
					method,
					strategy,
				};
			}
		}
	}
	return undefined;
}

export function applyOAuthProviderMetadataExtensions(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	type: OAuthMetadataContributionInput<Scope[]>["type"],
	metadata: AuthServerMetadata | OIDCMetadata,
) {
	const next: Record<string, unknown> = { ...metadata };
	for (const extension of getOAuthProviderExtensions(opts)) {
		const contribution = extension.metadata?.({
			ctx,
			opts,
			type,
			metadata,
		});
		for (const [key, value] of Object.entries(contribution ?? {})) {
			if (!(key in next)) {
				next[key] = value;
			}
		}
	}
	return next;
}

async function collectClaims(
	opts: OAuthOptions<Scope[]>,
	run: (
		extension: OAuthProviderExtension<Scope[]>,
	) => Awaitable<Record<string, unknown> | undefined>,
) {
	const claims: Record<string, unknown> = {};
	// First contributor wins a key, matching metadata extensions
	// (`applyOAuthProviderMetadataExtensions`). Extensions are expected to
	// contribute disjoint claims; this only fixes the resolution if they don't.
	for (const extension of getOAuthProviderExtensions(opts)) {
		const contribution = (await run(extension)) ?? {};
		for (const [key, value] of Object.entries(contribution)) {
			if (!(key in claims)) {
				claims[key] = value;
			}
		}
	}
	return claims;
}

export function collectExtensionAccessTokenClaims(
	opts: OAuthOptions<Scope[]>,
	input: OAuthClaimContributionInput<Scope[]>,
) {
	return collectClaims(opts, (extension) =>
		extension.claims?.accessToken?.(input),
	);
}

export function collectExtensionIdTokenClaims(
	opts: OAuthOptions<Scope[]>,
	input: OAuthClaimContributionInput<Scope[]>,
) {
	return collectClaims(opts, (extension) => extension.claims?.idToken?.(input));
}

export function collectExtensionUserInfoClaims(
	opts: OAuthOptions<Scope[]>,
	input: OAuthUserInfoContributionInput<Scope[]>,
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
