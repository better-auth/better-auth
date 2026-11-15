import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import {
	isReservedOAuthClientMetadataField,
	stripReservedOAuthClientMetadataExtensions,
} from "./client-metadata";
import type {
	ClientDiscovery,
	OAuthClaimExtensionInput,
	OAuthClientAuthenticationStrategy,
	OAuthClientMetadataExtensionInput,
	OAuthClientRegistrationMetadata,
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
	clientDiscoveryIds: string[];
	interactionRequestParameters: string[];
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
	const clientDiscoveryIds = toArray(extension.clientDiscovery).map(
		(discovery) => discovery.id,
	);
	for (const clientDiscoveryId of clientDiscoveryIds) {
		assertNonEmptyExtensionValue("client discovery id", clientDiscoveryId);
	}
	for (const field of extension.clientMetadata?.fields ?? []) {
		assertNonEmptyExtensionValue("client metadata field", field);
		if (isReservedOAuthClientMetadataField(field)) {
			throw new BetterAuthError(
				`OAuth Provider extension client metadata field is reserved: ${field}`,
			);
		}
	}
	return {
		grantTypes,
		authMethods,
		assertionTypes,
		clientDiscoveryIds,
		interactionRequestParameters: Object.keys(
			extension.interactionRequests ?? {},
		),
	};
}

/**
 * Names an extension in a setup error or warning. An extension without a
 * `name` is described by its position in registration order and one thing it
 * registers, skipping `conflictingValue` so both sides of a duplicate stay
 * distinct.
 */
function describeExtension(
	extensions: OAuthProviderExtension[],
	extension: OAuthProviderExtension,
	conflictingValue?: string,
): string {
	const name: unknown = extension.name;
	if (typeof name === "string" && name.trim().length > 0) {
		return `extension "${name}"`;
	}
	const position = `unnamed extension #${extensions.indexOf(extension) + 1}`;
	const registered: [label: string, values: string[]][] = [
		[
			"client discovery",
			toArray(extension.clientDiscovery).map((discovery) => discovery.id),
		],
		["grant type", Object.keys(extension.grants ?? {})],
		[
			"token_endpoint_auth_method",
			Object.keys(extension.clientAuthentication ?? {}),
		],
		[
			"interaction request parameter",
			Object.keys(extension.interactionRequests ?? {}),
		],
	];
	for (const [label, values] of registered) {
		const value = values.find((candidate) => candidate !== conflictingValue);
		if (value !== undefined) return `${position} (${label} "${value}")`;
	}
	return position;
}

function assertNoDuplicateAcrossExtensions(
	label: string,
	extensions: OAuthProviderExtension[],
	values: (keys: ExtensionKeys) => string[],
	keys: ExtensionKeys[],
) {
	const owners = new Map<string, OAuthProviderExtension>();
	keys.forEach((extensionKeys, index) => {
		const extension = extensions[index]!;
		for (const value of values(extensionKeys)) {
			const owner = owners.get(value);
			if (owner === extension) {
				throw new BetterAuthError(
					`OAuth Provider ${describeExtension(extensions, extension, value)} registers ${label} "${value}" more than once.`,
				);
			}
			if (owner !== undefined) {
				throw new BetterAuthError(
					`OAuth Provider ${describeExtension(extensions, owner, value)} and ${describeExtension(extensions, extension, value)} both register ${label} "${value}". Extension contributions must be disjoint.`,
				);
			}
			owners.set(value, extension);
		}
	});
}

/**
 * Validates every extension and rejects a grant type, auth method, assertion
 * type, client discovery identifier, or interaction request parameter that two
 * extensions, or one extension twice, register:
 * otherwise the first would win and the second be silently unreachable. Runs at
 * setup over the whole list; extensions number in the single digits, so a full
 * re-scan per registration is cheaper than the bookkeeping to cache it.
 */
export function validateOAuthProviderExtensions(
	extensions: OAuthProviderExtension[] | undefined,
) {
	const list = extensions ?? [];
	const keys = list.map(collectExtensionKeys);
	const check = (label: string, values: (k: ExtensionKeys) => string[]) =>
		assertNoDuplicateAcrossExtensions(label, list, values, keys);
	check("grant type", (k) => k.grantTypes);
	check("token_endpoint_auth_method", (k) => k.authMethods);
	check("client_assertion_type", (k) => k.assertionTypes);
	check("client discovery id", (k) => k.clientDiscoveryIds);
	check("interaction request parameter", (k) => k.interactionRequestParameters);
}

function getOAuthProviderExtensions(
	opts: OAuthOptions<Scope[]>,
): OAuthProviderExtension[] {
	return opts.extensions ?? [];
}

/**
 * The `beforeAuthorization` hooks in the order they run: extensions in
 * registration order, then the provider's own option.
 */
export function getBeforeAuthorizationHooks(opts: OAuthOptions<Scope[]>) {
	return [
		...getOAuthProviderExtensions(opts).map(
			(extension) => extension.beforeAuthorization,
		),
		opts.beforeAuthorization,
	].filter((hook) => hook !== undefined);
}

/**
 * Flattens the client-id discovery sources contributed by every registered
 * extension into a single ordered list. `getClient()` consults them in order;
 * the metadata endpoints merge their `discoveryMetadata`.
 */
export function getClientDiscoveries(
	opts: OAuthOptions<Scope[]>,
): ClientDiscovery[] {
	return getOAuthProviderExtensions(opts).flatMap((extension) =>
		toArray(extension.clientDiscovery),
	);
}

function toArray<T>(value: T | T[] | undefined): T[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
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
 * auth method, assertion type, or client discovery identifier that another
 * extension already registered (contributions must be disjoint).
 *
 * @example
 * ```ts
 * init(ctx) {
 *   extendOAuthProvider(ctx, {
 *     name: "my-plugin",
 *     grants: { "urn:example:grant": async ({ provider }) => provider.issueTokens(...) },
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

/**
 * Finds the interaction request a query identifies, such as a device approval
 * keyed by `user_code`. Authorization requests, which carry `response_type` or
 * a pushed `request_uri`, never match.
 */
export function getExtensionInteractionRequest(
	opts: OAuthOptions<Scope[]>,
	query: object,
) {
	const parameters = query as Record<string, unknown>;
	if (
		parameters.response_type !== undefined ||
		parameters.request_uri !== undefined
	) {
		return undefined;
	}
	for (const extension of getOAuthProviderExtensions(opts)) {
		for (const [parameter, handler] of Object.entries(
			extension.interactionRequests ?? {},
		)) {
			const value = parameters[parameter];
			if (typeof value === "string" && value) {
				return { parameter, handler, value };
			}
		}
	}
	return undefined;
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

const warnedMetadataCollisions = new WeakMap<object, Set<string>>();

// Discovery documents are rebuilt per request; log each warning once per provider.
function warnMetadataCollisionOnce(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	message: string,
) {
	let warned = warnedMetadataCollisions.get(opts);
	if (!warned) {
		warned = new Set();
		warnedMetadataCollisions.set(opts, warned);
	}
	if (warned.has(message)) return;
	warned.add(message);
	ctx.context.logger.warn(message);
}

/**
 * Builds the discovery document from the provider's `core` fields, each client
 * discovery's `discoveryMetadata` (later discoveries override earlier ones),
 * and each extension's `metadata()` result. Keys the provider owns are kept,
 * and extensions only add keys no client discovery set. Two extension lists
 * under one key combine without duplicates; any other shared extension key
 * keeps the first value. Every ignored contribution logs a warning.
 * `metadata()` sees the provider and client-discovery fields only, so
 * contributions stay order-independent.
 */
export function applyOAuthProviderMetadataExtensions<
	T extends AuthServerMetadata | OIDCMetadata,
>(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	type: OAuthMetadataExtensionInput["type"],
	core: T,
): T {
	const extensions = getOAuthProviderExtensions(opts);
	const warn = (message: string) =>
		warnMetadataCollisionOnce(ctx, opts, message);
	const describe = (extension: OAuthProviderExtension) =>
		describeExtension(extensions, extension);
	// Null-prototype targets keep own keys such as `__proto__` as plain data.
	const discoveryMetadata: Record<string, unknown> = Object.create(null);
	const discoveryOwners = new Map<string, OAuthProviderExtension>();
	for (const extension of extensions) {
		for (const discovery of toArray(extension.clientDiscovery)) {
			for (const [key, value] of Object.entries(
				discovery.discoveryMetadata ?? {},
			)) {
				if (Object.hasOwn(core, key)) {
					warn(
						`oauth-provider: ${describe(extension)} contributed the client discovery metadata key "${key}" to ${type}, which the provider owns; ignoring it.`,
					);
				}
				discoveryMetadata[key] = value;
				discoveryOwners.set(key, extension);
			}
		}
	}
	const document = { ...discoveryMetadata, ...core };
	const owners = new Map<string, OAuthProviderExtension>();
	const next: Record<string, unknown> = Object.assign(
		Object.create(null),
		document,
	);
	for (const extension of extensions) {
		const contribution = extension.metadata?.({ ctx, opts, type, document });
		for (const [key, value] of Object.entries(contribution ?? {})) {
			const existing = next[key];
			const owner = owners.get(key);
			const discoveryOwner = discoveryOwners.get(key);
			if (Object.hasOwn(core, key)) {
				warn(
					`oauth-provider: ${describe(extension)} contributed the discovery metadata key "${key}" to ${type}, which the provider owns; ignoring it.`,
				);
			} else if (discoveryOwner !== undefined) {
				warn(
					`oauth-provider: ${describe(extension)} contributed the discovery metadata key "${key}" to ${type}, which the client discovery of ${describe(discoveryOwner)} sets; keeping the client discovery's value.`,
				);
			} else if (owner === undefined) {
				next[key] = value;
				owners.set(key, extension);
			} else if (Array.isArray(existing) && Array.isArray(value)) {
				next[key] = [...new Set([...existing, ...value])];
			} else {
				warn(
					`oauth-provider: ${describe(owner)} and ${describe(extension)} both contributed the discovery metadata key "${key}" to ${type}; keeping the value from ${describe(owner)}.`,
				);
			}
		}
	}
	const published: Record<string, unknown> = { ...next };
	return published as T;
}

async function collectClaims(
	opts: OAuthOptions<Scope[]>,
	run: (
		extension: OAuthProviderExtension,
	) => Awaitable<Record<string, unknown> | undefined>,
) {
	const extensions = getOAuthProviderExtensions(opts);
	const claims: Record<string, unknown> = {};
	const owners = new Map<string, OAuthProviderExtension>();
	// First contributor wins a key, matching metadata extensions. Extensions are
	// expected to contribute disjoint claims, so a collision is a
	// misconfiguration: keep the first value and warn rather than silently
	// shadow the later contributor. An `undefined` value is not a contribution.
	for (const extension of extensions) {
		const contribution = (await run(extension)) ?? {};
		for (const [key, value] of Object.entries(contribution)) {
			if (value === undefined) continue;
			const owner = owners.get(key);
			if (owner !== undefined) {
				logger.warn(
					`oauth-provider: ${describeExtension(extensions, owner)} and ${describeExtension(extensions, extension)} both contributed the claim "${key}"; keeping the value from ${describeExtension(extensions, owner)}.`,
				);
				continue;
			}
			claims[key] = value;
			owners.set(key, extension);
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

/** Whether any extension declares client metadata fields or a validator. */
export function hasExtensionClientMetadata(
	opts: OAuthOptions<Scope[]>,
): boolean {
	return getOAuthProviderExtensions(opts).some(
		(extension) => extension.clientMetadata,
	);
}

/** Registration fields that extensions define, stored in the client's `metadata`. */
export function getExtensionClientMetadataFields(
	opts: OAuthOptions<Scope[]>,
): Set<string> {
	return new Set(
		getOAuthProviderExtensions(opts).flatMap(
			(extension) => extension.clientMetadata?.fields ?? [],
		),
	);
}

/**
 * Runs every extension's client metadata validator, in registration order.
 * Extensions read their fields from `metadata` only, so `metadata` and
 * declared fields are removed from the client they receive; a metadata
 * document carries declared fields at its top level.
 */
export async function validateExtensionClientMetadata(
	opts: OAuthOptions<Scope[]>,
	client: OAuthClientRegistrationMetadata,
	metadata: Record<string, unknown> | undefined,
): Promise<void> {
	const { metadata: _metadata, ...coreClient } = client;
	const extensionFields = getExtensionClientMetadataFields(opts);
	const input: OAuthClientMetadataExtensionInput = {
		client: Object.fromEntries(
			Object.entries(coreClient).filter(
				([field]) => !extensionFields.has(field),
			),
		) as Omit<OAuthClientRegistrationMetadata, "metadata">,
		metadata: stripReservedOAuthClientMetadataExtensions(metadata) ?? {},
	};
	for (const extension of getOAuthProviderExtensions(opts)) {
		await extension.clientMetadata?.validate?.(input);
	}
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
