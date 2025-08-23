import type {
	AuthMethod,
	AuthServerMetadata,
	OIDCMetadata,
} from "../../oauth-2.1/types";
import type { GenericEndpointContext } from "../../types";
import { getJwtPlugin } from "./utils";
import type { OAuthOptions } from "./types";
import type { JWSAlgorithms, JwtOptions } from "../jwt";

export function authServerMetadata(
	ctx: GenericEndpointContext,
	opts?: JwtOptions,
	scopesSupported?: string[],
) {
	const baseURL = ctx.context.baseURL;
	const authMethodsSupported: AuthMethod[] = [
		"client_secret_basic",
		"client_secret_post",
	];
	const metadata: AuthServerMetadata = {
		scopes_supported: scopesSupported,
		issuer: opts?.jwt?.issuer ?? baseURL,
		authorization_endpoint: `${baseURL}/oauth2/authorize`,
		token_endpoint: `${baseURL}/oauth2/token`,
		jwks_uri: opts?.jwks?.remoteUrl ? opts.jwks.remoteUrl : `${baseURL}/jwks`,
		registration_endpoint: `${baseURL}/oauth2/register`,
		introspection_endpoint: `${baseURL}/oauth2/introspect`,
		revocation_endpoint: `${baseURL}/oauth2/revoke`,
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: [
			"authorization_code",
			"refresh_token",
			"client_credentials",
		],
		token_endpoint_auth_signing_alg_values_supported: opts?.jwks?.keyPairConfig
			?.alg
			? [opts.jwks.keyPairConfig.alg]
			: ["EdDSA"],
		token_endpoint_auth_methods_supported: authMethodsSupported,
		introspection_endpoint_auth_methods_supported: authMethodsSupported,
		revocation_endpoint_auth_methods_supported: authMethodsSupported,
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
	const authMetadata = authServerMetadata(
		ctx,
		jwtPluginOptions,
		opts.advertisedMetadata?.scopes_supported ?? opts.scopes,
	);
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
