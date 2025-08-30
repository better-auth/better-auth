import type { OIDCMetadata } from "../types";
import type { MakeOIDCPlugin } from "../index";
import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "./resolve-oidc-options";

import { getJwtPlugin } from "./get-jwt-plugin";

export const resolveMetadata = (
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
	{ pathPrefix }: MakeOIDCPlugin,
): OIDCMetadata => {
	const jwtPlugin = getJwtPlugin(ctx);

	const issuer =
		jwtPlugin?.options?.jwt?.issuer ??
		ctx.context.options.baseURL ??
		ctx.context.baseURL;

	const baseURL = ctx.context.baseURL;
	const supportedAlgs = options.useJWTPlugin
		? ["RS256", "EdDSA", "none"]
		: ["HS256", "none"];

	return {
		issuer,
		authorization_endpoint: `${baseURL}/${pathPrefix}/authorize`,
		token_endpoint: `${baseURL}/${pathPrefix}/token`,
		userinfo_endpoint: `${baseURL}/${pathPrefix}/userinfo`,
		jwks_uri: `${baseURL}/jwks`,
		registration_endpoint: `${baseURL}/${pathPrefix}/register`,
		scopes_supported: ["openid", "profile", "email", "offline_access"],
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		acr_values_supported: [
			"urn:mace:incommon:iap:silver",
			"urn:mace:incommon:iap:bronze",
		],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: supportedAlgs,
		token_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
			"none",
		],
		code_challenge_methods_supported: ["S256"],
		claims_supported: [
			"sub",
			"iss",
			"aud",
			"exp",
			"nbf",
			"iat",
			"jti",
			"email",
			"email_verified",
			"name",
		],
		...options.metadata,
	};
};
