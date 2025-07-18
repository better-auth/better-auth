import { GenericEndpointContext } from "../../types";
import { getJwtPlugin, JwtPluginOptions } from "../jwt";
import { AuthServerMetadata } from "./types";

export function authServerMetadata(
	ctx: GenericEndpointContext,
	opts?: JwtPluginOptions,
	scopesSupported?: string[],
) {
	const baseURL = ctx.context.baseURL;
	const jwtPluginOptions = opts ?? getJwtPlugin(ctx.context).options;
	const metadata: AuthServerMetadata = {
		scopes_supported: scopesSupported,
		issuer: jwtPluginOptions?.jwt?.issuer ?? baseURL,
		authorization_endpoint: `${baseURL}/oauth2/authorize`,
		token_endpoint: `${baseURL}/oauth2/token`,
		jwks_uri: jwtPluginOptions?.jwks?.remoteUrl
			? jwtPluginOptions.jwks.remoteUrl
			: `${baseURL}/jwks`,
		registration_endpoint: `${baseURL}/oauth2/register`,
		introspection_endpoint: `${baseURL}/oauth2/introspect`,
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: [
			"authorization_code",
			"refresh_token",
			"client_credentials",
		],
		token_endpoint_auth_signing_alg_values_supported: jwtPluginOptions?.jwks
			?.keyPairConfig?.alg
			? [jwtPluginOptions?.jwks?.keyPairConfig?.alg]
			: ["EdDSA"],
		token_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
		],
		code_challenge_methods_supported: ["s256"],
	};
	return metadata;
}
