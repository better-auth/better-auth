import type { GenericEndpointContext } from "@better-auth/core";
import {
	DPOP_SIGNING_ALGORITHMS,
	PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
} from "@better-auth/core/oauth2";
import type { JWSAlgorithms, JwtOptions } from "better-auth/plugins";
import { UNSPECIFIED_ACR } from "./authentication-context";
import { validateIssuerUrl } from "./authorize";
import {
	applyOAuthProviderMetadataExtensions,
	getClientDiscoveries,
	getSupportedAuthMethods,
	getSupportedGrantTypes,
} from "./extensions";
import type { OAuthOptions, Scope } from "./types";
import type {
	AuthServerMetadata,
	GrantType,
	OIDCMetadata,
	TokenEndpointAuthMethod,
} from "./types/oauth";
import { getJwtPlugin, mergeDiscoveryMetadata } from "./utils";

export function authServerMetadata(
	ctx: GenericEndpointContext,
	opts?: JwtOptions,
	overrides?: {
		scopes_supported?: AuthServerMetadata["scopes_supported"];
		dynamic_client_registration_supported?: boolean;
		public_client_supported?: boolean;
		grant_types_supported?: GrantType[];
		token_endpoint_auth_methods_supported?: TokenEndpointAuthMethod[];
		endpoint_auth_methods_supported?: TokenEndpointAuthMethod[];
		jwt_disabled?: boolean;
		dpop_signing_alg_values_supported?: JWSAlgorithms[];
	},
) {
	const baseURL = ctx.context.baseURL;
	// Back-channel logout requires a verifiable Logout Token, which depends on
	// the JWT plugin's JWKS. Advertise support only when the plugin is enabled.
	const backchannelSupported = !overrides?.jwt_disabled;
	const metadata: AuthServerMetadata = {
		scopes_supported: overrides?.scopes_supported,
		issuer: validateIssuerUrl(opts?.jwt?.issuer ?? baseURL),
		authorization_endpoint: `${baseURL}/oauth2/authorize`,
		token_endpoint: `${baseURL}/oauth2/token`,
		jwks_uri: overrides?.jwt_disabled
			? undefined
			: (opts?.jwks?.remoteUrl ??
				`${baseURL}${opts?.jwks?.jwksPath ?? "/jwks"}`),
		registration_endpoint: overrides?.dynamic_client_registration_supported
			? `${baseURL}/oauth2/register`
			: undefined,
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
		token_endpoint_auth_methods_supported:
			overrides?.token_endpoint_auth_methods_supported ?? [
				...(overrides?.public_client_supported
					? (["none"] satisfies TokenEndpointAuthMethod[])
					: []),
				"client_secret_basic",
				"client_secret_post",
				"private_key_jwt",
			],
		token_endpoint_auth_signing_alg_values_supported: [
			...PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
		],
		introspection_endpoint_auth_methods_supported:
			overrides?.endpoint_auth_methods_supported ?? [
				"client_secret_basic",
				"client_secret_post",
				"private_key_jwt",
			],
		introspection_endpoint_auth_signing_alg_values_supported: [
			...PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
		],
		revocation_endpoint_auth_methods_supported:
			overrides?.endpoint_auth_methods_supported ?? [
				"client_secret_basic",
				"client_secret_post",
				"private_key_jwt",
			],
		revocation_endpoint_auth_signing_alg_values_supported: [
			...PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
		],
		code_challenge_methods_supported: ["S256"],
		authorization_response_iss_parameter_supported: true,
		dpop_signing_alg_values_supported:
			overrides?.dpop_signing_alg_values_supported ??
			([...DPOP_SIGNING_ALGORITHMS] as JWSAlgorithms[]),
		backchannel_logout_supported: backchannelSupported,
		backchannel_logout_session_supported: backchannelSupported,
	};
	return metadata;
}

/**
 * Builds the authorization-server metadata shared by the
 * `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`
 * responses, plus the inputs both need to finish their own document.
 */
function buildAuthServerMetadata(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const jwtPluginOptions = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context).options;
	const clientDiscoveries = getClientDiscoveries(opts);
	// Any contributed `clientDiscovery` implicitly produces public clients
	// (CIMD, wallet attestation, etc.), so it flips `public_client_supported`
	// and the advertised `"none"` auth method alongside unauthenticated DCR.
	const publicClientSupported =
		opts.allowUnauthenticatedClientRegistration || clientDiscoveries.length > 0;
	const authMetadata = authServerMetadata(ctx, jwtPluginOptions, {
		scopes_supported: opts.advertisedMetadata?.scopes_supported ?? opts.scopes,
		dynamic_client_registration_supported: opts.allowDynamicClientRegistration,
		public_client_supported: publicClientSupported,
		grant_types_supported: getSupportedGrantTypes(opts),
		token_endpoint_auth_methods_supported: getSupportedAuthMethods(opts, {
			includeNone: publicClientSupported,
		}),
		endpoint_auth_methods_supported: getSupportedAuthMethods(opts),
		jwt_disabled: opts.disableJwtPlugin,
		dpop_signing_alg_values_supported: opts.dpop?.signingAlgorithms,
	});
	return { jwtPluginOptions, clientDiscoveries, authMetadata };
}

export function oauthAuthorizationServerMetadata(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
): AuthServerMetadata {
	const { clientDiscoveries, authMetadata } = buildAuthServerMetadata(
		ctx,
		opts,
	);
	return applyOAuthProviderMetadataExtensions(
		ctx,
		opts,
		"oauth-authorization-server",
		{
			...mergeDiscoveryMetadata(clientDiscoveries),
			...authMetadata,
		},
	);
}

export function oidcServerMetadata(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]> & { claims?: string[] },
) {
	const baseURL = ctx.context.baseURL;
	const { jwtPluginOptions, clientDiscoveries, authMetadata } =
		buildAuthServerMetadata(ctx, opts);
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
		subject_types_supported: opts.pairwiseSecret
			? ["public", "pairwise"]
			: ["public"],
		acr_values_supported: opts.advertisedMetadata?.acr_values_supported ?? [
			UNSPECIFIED_ACR,
		],
		id_token_signing_alg_values_supported: (() => {
			if (opts.disableJwtPlugin) return ["HS256" as const];
			// Advertise every algorithm the plugin can sign with: the primary
			// keyPairConfig.alg plus every alg declared in keyPairConfigs[]
			// (lazy-minted on demand for per-resource signing pins).
			// Deduplicated so overlapping declarations don't produce repeats.
			const primary = jwtPluginOptions?.jwks?.keyPairConfig?.alg ?? "EdDSA";
			const extras =
				jwtPluginOptions?.jwks?.keyPairConfigs?.map((c) => c.alg) ?? [];
			return Array.from(new Set<JWSAlgorithms>([primary, ...extras]));
		})(),
		end_session_endpoint: `${baseURL}/oauth2/end-session`,
		request_parameter_supported: false,
		request_uri_parameter_supported: false,
		prompt_values_supported: [
			"login",
			"consent",
			"create",
			"select_account",
			"none",
		],
	};
	return applyOAuthProviderMetadataExtensions(
		ctx,
		opts,
		"openid-configuration",
		{
			...mergeDiscoveryMetadata(clientDiscoveries),
			...metadata,
		},
	);
}

// Cache for 15s with a short stale window; metadata rarely changes.
const METADATA_CACHE_CONTROL =
	"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400";

export function metadataResponse(
	body: unknown,
	extraHeaders?: HeadersInit,
): Response {
	const headers = new Headers(extraHeaders);
	if (!headers.has("Cache-Control")) {
		headers.set("Cache-Control", METADATA_CACHE_CONTROL);
	}
	headers.set("Content-Type", "application/json");
	return new Response(JSON.stringify(body), { status: 200, headers });
}

/**
 * Provides an exportable `/.well-known/oauth-authorization-server`.
 *
 * Useful when basePath prevents the endpoint from being located at the root
 * and must be provided manually.
 *
 * @external
 */
export const oauthProviderAuthServerMetadata = <
	Auth extends {
		api: {
			getOAuthServerConfig: (...args: any) => any;
		};
	},
>(
	auth: Auth,
	opts?: { headers?: HeadersInit },
) => {
	return async (request: Request) => {
		const res = await auth.api.getOAuthServerConfig({
			request,
			asResponse: false,
		});
		return metadataResponse(res, opts?.headers);
	};
};

/**
 * Provides an exportable `/.well-known/openid-configuration`.
 *
 * Useful when basePath prevents the endpoint from being located at the root
 * and must be provided manually.
 *
 * @external
 */
export const oauthProviderOpenIdConfigMetadata = <
	Auth extends {
		api: {
			getOpenIdConfig: (...args: any) => any;
		};
	},
>(
	auth: Auth,
	opts?: { headers?: HeadersInit },
) => {
	return async (request: Request) => {
		const res = await auth.api.getOpenIdConfig({
			request,
			asResponse: false,
		});
		return metadataResponse(res, opts?.headers);
	};
};
