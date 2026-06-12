import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import type { oauthProvider } from "./oauth";
import type {
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

function appendUnique<T extends string>(values: T[]): T[] {
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

function validateOAuthProviderExtension(
	extension: OAuthProviderExtension<Scope[]>,
) {
	for (const grantType of Object.keys(extension.grants ?? {})) {
		assertExtensionGrantType(grantType);
	}
	for (const [method, strategy] of Object.entries(
		extension.clientAuthentication ?? {},
	)) {
		assertExtensionTokenEndpointAuthMethod(method);
		const assertionTypes = strategy.assertionTypes ?? [method];
		if (assertionTypes.length === 0) {
			throw new BetterAuthError(
				`OAuth Provider extension client_assertion_type list cannot be empty for ${method}`,
			);
		}
		for (const assertionType of assertionTypes) {
			assertExtensionClientAssertionType(assertionType);
		}
	}
}

function getOAuthProviderExtensions(
	opts: OAuthOptions<Scope[]>,
): OAuthProviderExtension<Scope[]>[] {
	const extensions = opts.extensions ?? [];
	for (const extension of extensions) {
		validateOAuthProviderExtension(extension);
	}
	return extensions;
}

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
	validateOAuthProviderExtension(extension);
	provider.options.extensions = [
		...(provider.options.extensions ?? []),
		extension,
	];
}

function getExtensionGrantTypes(opts: OAuthOptions<Scope[]>): GrantType[] {
	return getOAuthProviderExtensions(opts).flatMap((extension) => {
		const grantTypes = Object.keys(extension.grants ?? {});
		return grantTypes;
	});
}

export function getSupportedGrantTypes(
	opts: OAuthOptions<Scope[]>,
): GrantType[] {
	return appendUnique([
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
	return appendUnique([
		...(settings?.includeNone ? (["none"] as TokenEndpointAuthMethod[]) : []),
		...BUILT_IN_CONFIDENTIAL_AUTH_METHODS,
		...getExtensionTokenEndpointAuthMethods(opts),
	]);
}

export function getSupportedEndpointAuthMethods(
	opts: OAuthOptions<Scope[]>,
): AuthMethod[] {
	return appendUnique([
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
	for (const extension of getOAuthProviderExtensions(opts)) {
		Object.assign(claims, (await run(extension)) ?? {});
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
