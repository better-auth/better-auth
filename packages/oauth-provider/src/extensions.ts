import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
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

const CONFIDENTIAL_AUTH_METHODS = [
	"client_secret_basic",
	"client_secret_post",
	"private_key_jwt",
] as const satisfies AuthMethod[];

function appendUnique<T extends string>(values: T[]): T[] {
	return Array.from(new Set(values));
}

function assertAbsoluteUri(value: string) {
	let url: URL | undefined;
	try {
		url = new URL(value);
	} catch {
		url = undefined;
	}
	if (url?.protocol) return;
	throw new BetterAuthError(
		`OAuth Provider extension grant type must be an absolute URI: ${value}`,
	);
}

function getOAuthProviderExtensions(
	opts: OAuthOptions<Scope[]>,
): OAuthProviderExtension<Scope[]>[] {
	return opts.extensions ?? [];
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
	provider.options.extensions = [
		...(provider.options.extensions ?? []),
		extension,
	];
}

function getExtensionGrantTypes(opts: OAuthOptions<Scope[]>): GrantType[] {
	return getOAuthProviderExtensions(opts).flatMap((extension) => {
		const grantTypes = Object.keys(extension.grants ?? {});
		for (const grantType of grantTypes) {
			assertAbsoluteUri(grantType);
		}
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
		...CONFIDENTIAL_AUTH_METHODS,
		...getExtensionTokenEndpointAuthMethods(opts),
	]);
}

export function getSupportedEndpointAuthMethods(
	opts: OAuthOptions<Scope[]>,
): AuthMethod[] {
	return appendUnique([
		...CONFIDENTIAL_AUTH_METHODS,
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
	for (const extension of getOAuthProviderExtensions(opts)) {
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
