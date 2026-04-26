import type { GenericEndpointContext } from "@better-auth/core";
import { ASSERTION_SIGNING_ALGORITHMS } from "@better-auth/core/oauth2";
import type { JWSAlgorithms, JwtOptions } from "better-auth/plugins";
import { validateIssuerUrl } from "./authorize";
import type { OAuthOptions, Scope } from "./types";
import type {
	AuthServerMetadata,
	GrantType,
	OIDCMetadata,
	TokenEndpointAuthMethod,
} from "./types/oauth";
import {
	getJwtPlugin,
	mergeDiscoveryMetadata,
	toClientDiscoveryArray,
} from "./utils";

export function authServerMetadata(
	ctx: GenericEndpointContext,
	opts?: JwtOptions,
	overrides?: {
		scopes_supported?: AuthServerMetadata["scopes_supported"];
		public_client_supported?: boolean;
		grant_types_supported?: GrantType[];
		jwt_disabled?: boolean;
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
			"private_key_jwt",
		],
		token_endpoint_auth_signing_alg_values_supported: [
			...ASSERTION_SIGNING_ALGORITHMS,
		],
		introspection_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
			"private_key_jwt",
		],
		introspection_endpoint_auth_signing_alg_values_supported: [
			...ASSERTION_SIGNING_ALGORITHMS,
		],
		revocation_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
			"private_key_jwt",
		],
		revocation_endpoint_auth_signing_alg_values_supported: [
			...ASSERTION_SIGNING_ALGORITHMS,
		],
		code_challenge_methods_supported: ["S256"],
		authorization_response_iss_parameter_supported: true,
		backchannel_logout_supported: backchannelSupported,
		backchannel_logout_session_supported: backchannelSupported,
	};
	return metadata;
}

export function oidcServerMetadata(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]> & { claims?: string[] },
) {
	const baseURL = ctx.context.baseURL;
	const jwtPluginOptions = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context).options;
	const authMetadata = authServerMetadata(ctx, jwtPluginOptions, {
		scopes_supported: opts.advertisedMetadata?.scopes_supported ?? opts.scopes,
		// `public_client_supported` flips `"none"` into the advertised auth
		// methods. Any configured `clientDiscovery` implicitly produces public
		// clients (CIMD, wallet attestation, etc.), so the flag must reflect
		// that in addition to unauthenticated DCR.
		public_client_supported:
			opts.allowUnauthenticatedClientRegistration ||
			toClientDiscoveryArray(opts.clientDiscovery).length > 0,
		grant_types_supported: opts.grantTypes,
		jwt_disabled: opts.disableJwtPlugin,
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
		subject_types_supported: opts.pairwiseSecret
			? ["public", "pairwise"]
			: ["public"],
		id_token_signing_alg_values_supported: jwtPluginOptions?.jwks?.keyPairConfig
			?.alg
			? [jwtPluginOptions?.jwks?.keyPairConfig?.alg]
			: opts.disableJwtPlugin
				? ["HS256"]
				: ["EdDSA"],
		end_session_endpoint: `${baseURL}/oauth2/end-session`,
		acr_values_supported: ["urn:mace:incommon:iap:bronze"],
		prompt_values_supported: [
			"login",
			"consent",
			"create",
			"select_account",
			"none",
		],
	};
	return {
		...metadata,
		...mergeDiscoveryMetadata(opts.clientDiscovery),
	};
}

// Cache for 15s with a short stale window; metadata rarely changes.
const METADATA_CACHE_CONTROL =
	"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400";

function metadataResponse(body: unknown, extraHeaders?: HeadersInit): Response {
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
