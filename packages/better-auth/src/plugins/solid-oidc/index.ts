import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { mergeSchema } from "../../db/schema";
import { getOAuthCallbackPath } from "../../oauth2/utils";
import { PACKAGE_VERSION } from "../../version";
import {
	buildSolidClientIdDocument,
	CLIENT_ID_DOCUMENT_CONTENT_TYPE,
	DEFAULT_SOLID_SCOPES,
} from "./client-id-document";
import { SOLID_OIDC_ERROR_CODES } from "./error-codes";
import { createSolidDpopKeyStore } from "./key-store";
import { createSolidProvider } from "./provider";
import { schema } from "./schema";
import type { SolidOidcConfig, SolidOidcOptions } from "./types";
import { trimTrailingSlash } from "./utils";
import { canonicalizeIssuer } from "./webid";

export * from "./client-id-document";
export * from "./dpop";
export { SOLID_OIDC_ERROR_CODES } from "./error-codes";
export type { SolidDpopKeyStore } from "./key-store";
export { createSolidDpopKeyStore, hashSolidToken } from "./key-store";
export type { SolidDpopKeyRecord } from "./schema";
export type {
	SolidClientIdDocumentConfig,
	SolidOidcConfig,
	SolidOidcDpopConfig,
	SolidOidcOptions,
	SolidOidcProfile,
	SolidProviderMetadata,
} from "./types";
export * from "./webid";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"solid-oidc": {
			creator: typeof solidOidc;
		};
	}
}

const DEFAULT_PROVIDER_ID = "solid";
const DEFAULT_CLIENT_ID_DOCUMENT_PATH = "/solid/client-id";

function resolveProviderId(config: SolidOidcConfig) {
	return config.providerId ?? DEFAULT_PROVIDER_ID;
}

/**
 * The `client_id` sent to the provider: an explicitly configured value, a
 * statically registered client ID, or the URL this plugin serves the provider's
 * Client Identifier Document from.
 *
 * Solid-OIDC requires `client_id` to be the document's own dereferenceable URI,
 * so the default is derived from the same path the endpoint below is mounted at.
 */
function resolveClientId(
	config: SolidOidcConfig,
	{
		baseURL,
		clientIdDocumentPath,
	}: { baseURL: string; clientIdDocumentPath: string },
) {
	const documentConfig =
		config.clientIdDocument === false ? undefined : config.clientIdDocument;
	return (
		documentConfig?.clientId ??
		config.clientId ??
		`${trimTrailingSlash(baseURL)}${clientIdDocumentPath}/${resolveProviderId(config)}`
	);
}

/**
 * `openid` makes it an OIDC request and `webid` is what puts the WebID claim in
 * the ID token, so neither is dropped however scopes were configured.
 */
function resolveScopes(config: SolidOidcConfig) {
	const scopes = config.scopes?.length ? config.scopes : DEFAULT_SOLID_SCOPES;
	const required = ["openid", "webid"].filter(
		(scope) => !scopes.includes(scope),
	);
	return [...required, ...scopes];
}

function resolveRedirectURI(config: SolidOidcConfig, baseURL: string) {
	return (
		config.redirectURI ??
		`${trimTrailingSlash(baseURL)}${getOAuthCallbackPath({
			id: resolveProviderId(config),
		})}`
	);
}

function validateConfig(config: SolidOidcConfig) {
	const providerId = resolveProviderId(config);
	if (!canonicalizeIssuer(config.issuer)) {
		throw new Error(
			`Solid-OIDC provider "${providerId}": issuer must be an absolute http(s) URL, received "${config.issuer}"`,
		);
	}
	const authMethod = config.tokenEndpointAuthMethod;
	if (config.clientSecret && authMethod === "none") {
		throw new Error(
			`Solid-OIDC provider "${providerId}": tokenEndpointAuthMethod "none" cannot be combined with clientSecret`,
		);
	}
	if (
		!config.clientSecret &&
		(authMethod === "client_secret_basic" ||
			authMethod === "client_secret_post")
	) {
		throw new Error(
			`Solid-OIDC provider "${providerId}": tokenEndpointAuthMethod "${authMethod}" requires clientSecret`,
		);
	}
	if (config.clientSecret && config.clientIdDocument !== false) {
		throw new Error(
			`Solid-OIDC provider "${providerId}": a client identified by a Client Identifier Document has no clientSecret. Set clientIdDocument: false to use a statically registered client.`,
		);
	}
	if (!config.clientId && config.clientIdDocument === false) {
		throw new Error(
			`Solid-OIDC provider "${providerId}": clientId is required when clientIdDocument is false`,
		);
	}
}

/**
 * Authentication layer for Solid-compatible servers.
 *
 * Registers one social provider per configured Solid Protocol Server, and adds
 * the three things Solid-OIDC requires that a plain OpenID Connect client does
 * not:
 *
 * 1. **DPoP-bound tokens.** Every token-endpoint request carries an RFC 9449
 *    proof, and the key each refresh token is bound to is persisted encrypted so
 *    the refresh grant can replay it.
 * 2. **WebID identity.** The account is keyed by the `webid` claim rather than
 *    the provider's local `sub`, so a person keeps one account across pods.
 * 3. **WebID/issuer confirmation.** The WebID document must name the provider as
 *    a trusted issuer, so a configured provider cannot assert a WebID it has no
 *    authority over.
 *
 * The plugin also serves each provider's Client Identifier Document, which is
 * how a Solid Protocol Server identifies a client that has no pre-registration.
 *
 * Sign-in goes through the standard `signIn.social({ provider })` endpoint; no
 * client plugin is needed.
 *
 * @see https://solidproject.org/TR/oidc
 * @see https://www.rfc-editor.org/rfc/rfc9449.html
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { solidOidc } from "better-auth/plugins";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     solidOidc({
 *       config: [
 *         {
 *           providerId: "pod",
 *           issuer: "https://solid.example",
 *           clientIdDocument: { clientName: "My App" },
 *         },
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export const solidOidc = (options: SolidOidcOptions) => {
	const clientIdDocumentPath = options.clientIdDocumentPath
		? `/${trimTrailingSlash(options.clientIdDocumentPath).replace(/^\/+/, "")}`
		: DEFAULT_CLIENT_ID_DOCUMENT_PATH;

	if (options.config.length === 0) {
		throw new Error("solidOidc requires at least one provider config");
	}

	const seen = new Set<string>();
	for (const config of options.config) {
		validateConfig(config);
		const providerId = resolveProviderId(config);
		if (seen.has(providerId)) {
			throw new Error(
				`Solid-OIDC provider ID "${providerId}" is configured more than once`,
			);
		}
		seen.add(providerId);
	}

	const configById = new Map(
		options.config.map((config) => [resolveProviderId(config), config]),
	);

	return {
		id: "solid-oidc",
		version: PACKAGE_VERSION,
		options,
		schema: mergeSchema(schema, options.schema),
		init: (ctx: AuthContext) => {
			const keyStore = createSolidDpopKeyStore(ctx);
			const providers = options.config.map((config) =>
				createSolidProvider({
					config,
					ctx,
					keyStore,
					providerId: resolveProviderId(config),
					clientId: resolveClientId(config, {
						baseURL: ctx.baseURL,
						clientIdDocumentPath,
					}),
					scopes: resolveScopes(config),
				}),
			);

			const existing = new Set(ctx.socialProviders.map((p) => p.id));
			for (const provider of providers) {
				if (existing.has(provider.id)) {
					ctx.logger.warn(
						`Solid-OIDC provider "${provider.id}" shadows an already registered social provider with the same ID`,
					);
				}
			}

			return {
				context: {
					socialProviders: providers.concat(ctx.socialProviders),
				},
			};
		},
		endpoints: {
			getSolidClientIdDocument: createAuthEndpoint(
				`${clientIdDocumentPath}/:providerId`,
				{
					method: "GET",
					metadata: {
						openapi: {
							operationId: "getSolidClientIdDocument",
							description:
								"Get the Solid-OIDC Client Identifier Document for a configured provider. A Solid OpenID Provider dereferences this URL instead of looking the client up in a registration database.",
							responses: {
								"200": {
									description:
										"Client Identifier Document. Served as application/ld+json; documented under application/json because that is what the OpenAPI metadata type models.",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													"@context": {
														type: "array",
														items: { type: "string" },
													},
													client_id: { type: "string" },
													client_name: { type: "string" },
													redirect_uris: {
														type: "array",
														items: { type: "string" },
													},
													grant_types: {
														type: "array",
														items: { type: "string" },
													},
													response_types: {
														type: "array",
														items: { type: "string" },
													},
													scope: { type: "string" },
													token_endpoint_auth_method: { type: "string" },
												},
												required: [
													"@context",
													"client_id",
													"redirect_uris",
													"grant_types",
													"response_types",
													"scope",
													"token_endpoint_auth_method",
												],
											},
										},
									},
								},
								"404": {
									description:
										"No configured Solid-OIDC provider with that ID serves a Client Identifier Document",
								},
							},
						},
					},
				},
				async (ctx) => {
					const providerId = ctx.params?.providerId;
					const config = providerId ? configById.get(providerId) : undefined;
					if (!config || config.clientIdDocument === false) {
						throw APIError.from(
							"NOT_FOUND",
							SOLID_OIDC_ERROR_CODES.CLIENT_ID_DOCUMENT_DISABLED,
						);
					}
					const baseURL = ctx.context.baseURL;
					const documentConfig = config.clientIdDocument ?? {};
					const document = buildSolidClientIdDocument({
						clientId: resolveClientId(config, {
							baseURL,
							clientIdDocumentPath,
						}),
						redirectURIs: [resolveRedirectURI(config, baseURL)],
						clientName: documentConfig.clientName ?? config.name,
						clientURI: documentConfig.clientURI,
						logoURI: documentConfig.logoURI,
						tosURI: documentConfig.tosURI,
						policyURI: documentConfig.policyURI,
						contacts: documentConfig.contacts,
						postLogoutRedirectURIs: documentConfig.postLogoutRedirectURIs,
						scopes: resolveScopes(config),
						additionalMetadata: documentConfig.additionalMetadata,
					});

					return new Response(JSON.stringify(document, null, 2), {
						status: 200,
						headers: {
							"content-type": CLIENT_ID_DOCUMENT_CONTENT_TYPE,
							// Public, slow-moving configuration that a provider re-reads
							// on every authorization request.
							"cache-control": "public, max-age=3600",
						},
					});
				},
			),
		},
		$ERROR_CODES: SOLID_OIDC_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
