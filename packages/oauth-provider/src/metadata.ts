import type { GenericEndpointContext } from "@better-auth/core";
import { PRIVATE_KEY_JWT_SIGNING_ALGORITHMS } from "@better-auth/core/oauth2";
import { APIError } from "better-auth/api";
import type { JWSAlgorithms, JwtOptions } from "better-auth/plugins";
import { getAudience } from "./audiences";
import { validateIssuerUrl } from "./authorize";
import type { OAuthOptions, Scope } from "./types";
import type {
	AuthServerMetadata,
	GrantType,
	OIDCMetadata,
	ResourceServerMetadata,
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
		dynamic_client_registration_supported?: boolean;
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
		token_endpoint_auth_methods_supported: [
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
		introspection_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
			"private_key_jwt",
		],
		introspection_endpoint_auth_signing_alg_values_supported: [
			...PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
		],
		revocation_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
			"private_key_jwt",
		],
		revocation_endpoint_auth_signing_alg_values_supported: [
			...PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
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
		dynamic_client_registration_supported: opts.allowDynamicClientRegistration,
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
		id_token_signing_alg_values_supported: (() => {
			if (opts.disableJwtPlugin) return ["HS256" as const];
			// Advertise every algorithm the plugin can sign with: the primary
			// keyPairConfig.alg plus every alg declared in keyPairConfigs[]
			// (lazy-minted on demand for per-audience signing pins).
			// Deduplicated so overlapping declarations don't produce repeats.
			const primary = jwtPluginOptions?.jwks?.keyPairConfig?.alg ?? "EdDSA";
			const extras =
				jwtPluginOptions?.jwks?.keyPairConfigs?.map((c) => c.alg) ?? [];
			return Array.from(new Set<JWSAlgorithms>([primary, ...extras]));
		})(),
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

/**
 * Builds an RFC 9728 protected-resource metadata object from a stored
 * `oauthAudience` row. Endpoint shape: `/.well-known/oauth-protected-resource/:identifier`
 * (identifier URL-encoded as a single path segment).
 *
 * Opt-in via {@link OAuthOptions.publishProtectedResourceMetadata} — when
 * false (the default), the endpoint returns 404 so audience identifiers
 * aren't probed on deployments that haven't authorized publishing.
 *
 * @see RFC 9728 — OAuth 2.0 Protected Resource Metadata
 */
export async function protectedResourceMetadata(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	identifier: string,
): Promise<ResourceServerMetadata> {
	if (!opts.publishProtectedResourceMetadata) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: "protected resource metadata publishing is disabled",
		});
	}
	const audience = await getAudience(ctx, opts, identifier);
	if (!audience) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `audience ${identifier} not found`,
		});
	}
	// Disabled audiences are no longer valid resource-server targets — RFC 9728
	// metadata MUST NOT advertise them. Return the same `not_found` shape as a
	// missing row so external probes can't distinguish "doesn't exist" from
	// "temporarily disabled" (avoids leaking lifecycle state to unauthenticated
	// callers).
	if (audience.disabled) {
		throw new APIError("NOT_FOUND", {
			error: "not_found",
			error_description: `audience ${identifier} not found`,
		});
	}
	const baseURL = ctx.context.baseURL;
	const jwtPluginOptions = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context).options;
	const issuer = validateIssuerUrl(jwtPluginOptions?.jwt?.issuer ?? baseURL);
	const signingAlgs: JWSAlgorithms[] | undefined = audience.signingAlgorithm
		? [audience.signingAlgorithm]
		: undefined;
	const metadata: ResourceServerMetadata = {
		resource: audience.identifier,
		authorization_servers: [issuer],
		bearer_methods_supported: ["header"],
		scopes_supported: audience.allowedScopes ?? undefined,
		resource_signing_alg_values_supported: signingAlgs,
	};
	return metadata;
}

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
