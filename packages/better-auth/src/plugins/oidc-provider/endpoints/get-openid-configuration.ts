import type { OIDCMetadata, OIDCOptions } from "../types";
import type { MakeOidcPlugin } from "../make-oidc-plugin";
import type { GenericEndpointContext } from "../../../types";

import { createAuthEndpoint } from "../../../api";
import { getJwtPlugin } from "../utils/get-jwt-plugin";

export const getMetadata = (
	ctx: GenericEndpointContext,
	options: OIDCOptions,
	{ pathPrefix }: MakeOidcPlugin,
): OIDCMetadata => {
	const jwtPlugin = getJwtPlugin(ctx);

	const issuer =
		jwtPlugin && jwtPlugin.options?.jwt && jwtPlugin.options.jwt.issuer
			? jwtPlugin.options.jwt.issuer
			: (ctx.context.options.baseURL as string);

	const baseURL = ctx.context.baseURL;
	const supportedAlgs = options?.useJWTPlugin
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
		...options?.metadata,
	};
};

export const getOpenIdConfig = (
	options: OIDCOptions,
	makePluginOpts: MakeOidcPlugin,
) =>
	createAuthEndpoint(
		"/.well-known/openid-configuration",
		{
			method: "GET",
			metadata: {
				isAction: false,
			},
		},
		async (ctx) => {
			const metadata = getMetadata(ctx, options, makePluginOpts);
			return ctx.json(metadata);
		},
	);
