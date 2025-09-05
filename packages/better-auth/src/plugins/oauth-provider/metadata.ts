import type {
	AuthServerMetadata,
	GrantType,
	OIDCMetadata,
	ResourceServerMetadata,
	TokenEndpointAuthMethod,
} from "../../oauth-2.1/types";
import type { GenericEndpointContext } from "../../types";
import { getJwtPlugin } from "./utils";
import type { OAuthOptions } from "./types";
import type { JWSAlgorithms, JwtOptions } from "../jwt";

export function authServerMetadata(
	ctx: GenericEndpointContext,
	opts?: JwtOptions,
	overrides?: {
		scopes_supported?: AuthServerMetadata["scopes_supported"];
		public_client_supported?: boolean;
		grant_types_supported?: GrantType[];
	},
) {
	const baseURL = ctx.context.baseURL;
	const metadata: AuthServerMetadata = {
		scopes_supported: overrides?.scopes_supported,
		issuer: opts?.jwt?.issuer ?? baseURL,
		authorization_endpoint: `${baseURL}/oauth2/authorize`,
		token_endpoint: `${baseURL}/oauth2/token`,
		jwks_uri: opts?.jwks?.remoteUrl ?? `${baseURL}/jwks`,
		registration_endpoint: `${baseURL}/oauth2/register`,
		introspection_endpoint: `${baseURL}/oauth2/introspect`,
		revocation_endpoint: `${baseURL}/oauth2/revoke`,
		response_types_supported:
			overrides?.grant_types_supported &&
			!overrides.grant_types_supported.includes("authorization_code")
				? []
				: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: overrides?.grant_types_supported ?? [
			"authorization_code",
			"client_credentials",
			"refresh_token",
		],
		token_endpoint_auth_methods_supported: [
			...(overrides?.public_client_supported
				? (["none"] satisfies TokenEndpointAuthMethod[])
				: []),
			"client_secret_basic",
			"client_secret_post",
		],
		introspection_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
		],
		revocation_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
		],
		code_challenge_methods_supported: ["S256"],
	};
	return metadata;
}

export function oidcServerMetadata(
	ctx: GenericEndpointContext,
	opts: OAuthOptions & { claims?: string[] },
) {
	const baseURL = ctx.context.baseURL;
	const jwtPluginOptions = opts.disableJWTPlugin
		? undefined
		: getJwtPlugin(ctx.context).options;
	const authMetadata = authServerMetadata(ctx, jwtPluginOptions, {
		scopes_supported: opts.advertisedMetadata?.scopes_supported ?? opts.scopes,
		public_client_supported: opts.allowUnauthenticatedClientRegistration,
		grant_types_supported: opts.grantTypes,
	});
	const metadata: Omit<
		OIDCMetadata,
		"id_token_signing_alg_values_supported"
	> & {
		id_token_signing_alg_values_supported: JWSAlgorithms[] | ["HS256"];
	} = {
		...authMetadata,
		claims_supported:
			opts?.advertisedMetadata?.claims_supported ?? opts?.claims ?? [],
		userinfo_endpoint: `${baseURL}/oauth2/userinfo`,
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: jwtPluginOptions?.jwks?.keyPairConfig
			?.alg
			? [jwtPluginOptions?.jwks?.keyPairConfig?.alg]
			: opts.disableJWTPlugin
				? ["HS256"]
				: ["EdDSA"],
		acr_values_supported: ["urn:mace:incommon:iap:bronze"],
	};
	return metadata;
}

export function protectedResourceMetadata(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	const baseURL = ctx.context.baseURL;
	const jwtPluginOptions = opts.disableJWTPlugin
		? undefined
		: getJwtPlugin(ctx.context).options;

	return {
		resource: jwtPluginOptions?.jwt?.audience ?? baseURL,
		authorization_servers: [baseURL],
		jwks_uri: jwtPluginOptions?.jwks?.remoteUrl ?? `${baseURL}/jwks`,
		scopes_supported: opts.advertisedMetadata?.scopes_supported ?? opts.scopes,
	} satisfies ResourceServerMetadata;
}

/**
 * Provides an exportable `/.well-known/oauth-authorization-server`.
 *
 * Useful when basePath prevents the endpoint from being located at the root
 * and must be provided manually.
 */
export const oAuthProviderAuthServerMetadata = <
	Auth extends {
		api: {
			getOAuthServerConfig: (...args: any) => any;
		};
	},
>(
	auth: Auth,
	headers?: HeadersInit,
) => {
	return async (request: Request) => {
		const res = await auth.api.getOAuthServerConfig();
		return new Response(JSON.stringify(res), {
			status: 200,
			headers: {
				// We should cache here because it is unlikely this will
				// change frequently and if it does shouldn't be more than
				// for 15 seconds in a change period
				"Cache-Control":
					"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400", // 15 sec
				...headers,
				"Content-Type": "application/json",
			},
		});
	};
};

/**
 * Provides an exportable `/.well-known/openid-configuration`.
 *
 * Useful when basePath prevents the endpoint from being located at the root
 * and must be provided manually.
 */
export const oAuthProviderOpenIdConfigMetadata = <
	Auth extends {
		api: {
			getOpenIdConfig: (...args: any) => any;
		};
	},
>(
	auth: Auth,
	headers: HeadersInit,
) => {
	return async (request: Request) => {
		const res = await auth.api.getOpenIdConfig();
		return new Response(JSON.stringify(res), {
			status: 200,
			headers: {
				// We should cache here because it is unlikely this will
				// change frequently and if it does shouldn't be more than
				// for 15 seconds in a change period
				"Cache-Control":
					"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400", // 15 sec
				...headers,
				"Content-Type": "application/json",
			},
		});
	};
};

/**
 * Provides an exportable `/.well-known/oauth-protected-resource`.
 *
 * Useful when basePath prevents the endpoint from being located at the root
 * and must be provided manually.
 */
export const oAuthProviderProtectedResourceMetadata = <
	Auth extends {
		api: {
			getMCPProtectedResource: (...args: any) => any;
		};
	},
>(
	auth: Auth,
	headers?: HeadersInit,
) => {
	return async (request: Request) => {
		const res = await auth.api.getMCPProtectedResource();
		return new Response(JSON.stringify(res), {
			status: 200,
			headers: {
				// We should cache here because it is unlikely this will
				// change frequently and if it does shouldn't be more than
				// for 15 seconds in a change period
				"Cache-Control":
					"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400", // 15 sec
				...headers,
				"Content-Type": "application/json",
			},
		});
	};
};
