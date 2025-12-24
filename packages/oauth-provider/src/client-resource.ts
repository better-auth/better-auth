import { logger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { verifyAccessToken } from "better-auth/oauth2";
import type { Auth, BetterAuthClientPlugin } from "better-auth/types";
import { APIError } from "better-call";
import type { JWTPayload, JWTVerifyOptions } from "jose";
import { handleMcpErrors } from "./mcp";
import type { ResourceServerMetadata } from "./types/oauth";
import { getJwtPlugin, getOAuthProviderPlugin } from "./utils";

export const oauthProviderResourceClient = <T extends Auth | undefined>(
	auth?: T,
) => {
	const oauthProviderPlugin = auth ? getOAuthProviderPlugin(auth) : undefined;
	const oauthProviderOptions = oauthProviderPlugin?.options;
	const jwtPlugin =
		auth && !oauthProviderOptions?.disableJwtPlugin
			? getJwtPlugin(auth)
			: undefined;
	const jwtPluginOptions = jwtPlugin?.options;
	const authServerBaseUrl = auth?.options.baseURL;
	const authServerBasePath = auth?.options.basePath;
	const authorizationServer =
		jwtPluginOptions?.jwt?.issuer ?? authServerBaseUrl;

	return {
		id: "oauth-provider-resource-client",
		getActions() {
			return {
				/**
				 * Performs verification of an access token for your APIs. Can perform
				 * local verification using `jwksUrl` by default. Can also be configured
				 * for remote introspection using `remoteVerify` if a confidential client
				 * is set up for this API.
				 *
				 * The optional auth parameter can fill known values automatically.
				 */
				verifyAccessToken: (async (
					token: string | undefined,
					opts?: {
						verifyOptions?: JWTVerifyOptions &
							Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
						scopes?: string[];
						jwksUrl?: string;
						remoteVerify?: VerifyAccessTokenRemote;
						/** Maps non-url (ie urn, client) resources to resource_metadata */
						resourceMetadataMappings?: Record<string, string>;
					},
				): Promise<JWTPayload> => {
					const audience = opts?.verifyOptions?.audience ?? authServerBaseUrl;
					const issuer =
						opts?.verifyOptions?.issuer ??
						jwtPluginOptions?.jwt?.issuer ??
						authServerBaseUrl;
					if (!audience) {
						throw Error("please define opts.verifyOptions.audience");
					}
					if (!issuer) {
						throw Error("please define opts.verifyOptions.issuer");
					}
					const jwksUrl =
						opts?.jwksUrl ??
						jwtPluginOptions?.jwks?.remoteUrl ??
						(authServerBaseUrl
							? `${authServerBaseUrl + (authServerBasePath ?? "")}/${jwtPluginOptions?.jwks?.jwksPath ?? "jwks"}`
							: undefined);
					const introspectUrl =
						opts?.remoteVerify?.introspectUrl ??
						(authServerBaseUrl
							? `${authServerBaseUrl}${authServerBasePath ?? ""}/oauth2/introspect`
							: undefined);

					try {
						if (!token?.length) {
							throw new APIError("UNAUTHORIZED", {
								message: "missing authorization header",
							});
						}
						return await verifyAccessToken(token, {
							...opts,
							jwksUrl,
							verifyOptions: {
								...opts?.verifyOptions,
								audience,
								issuer,
							},
							remoteVerify:
								opts?.remoteVerify && introspectUrl
									? {
											...opts.remoteVerify,
											introspectUrl,
										}
									: undefined,
						});
					} catch (error) {
						throw handleMcpErrors(error, audience, {
							resourceMetadataMappings: opts?.resourceMetadataMappings,
						});
					}
				}) as VerifyAccessTokenOutput<T>,
				/**
				 * An authorization server does not typically publish
				 * the `/.well-known/oauth-protected-resource` themselves.
				 * Thus, we provide a client-only endpoint to help set up
				 * your protected resource metadata.
				 *
				 * The optional auth parameter can fill known values automatically.
				 *
				 * @see https://datatracker.ietf.org/doc/html/rfc8414#section-2
				 */
				getProtectedResourceMetadata: (async (
					overrides: Partial<ResourceServerMetadata> | undefined,
					opts:
						| {
								silenceWarnings?: {
									oidcScopes?: boolean;
								};
								externalScopes?: string[];
						  }
						| undefined,
				): Promise<ResourceServerMetadata> => {
					const resource = overrides?.resource ?? authServerBaseUrl;
					if (!resource) {
						throw Error("missing required resource");
					}
					if (
						oauthProviderOptions?.scopes &&
						opts?.externalScopes &&
						(overrides?.authorization_servers?.length ?? 0) <= 1
					) {
						throw new BetterAuthError(
							"external scopes should not be provided with one authorization server",
						);
					}
					// Resource server should not mention specific scopes
					if (overrides?.scopes_supported) {
						const allValidScopes = new Set([
							...(oauthProviderOptions?.scopes ?? []),
							...(opts?.externalScopes ?? []),
						]);
						for (const sc of overrides.scopes_supported) {
							if (sc === "openid") {
								throw new BetterAuthError(
									"Only the Auth Server should utilize the openid scope",
								);
							}
							if (["profile", "email", "phone", "address"].includes(sc)) {
								if (!opts?.silenceWarnings?.oidcScopes) {
									logger.warn(
										`"${sc}" is typically restricted for the authorization server, a resource server typically shouldn't handle this scope`,
									);
								}
							}
							if (!allValidScopes.has(sc)) {
								throw new BetterAuthError(
									`Unsupported scope ${sc}. If external, please add to "externalScopes"`,
								);
							}
						}
					}

					return {
						resource,
						authorization_servers: authorizationServer
							? [authorizationServer]
							: undefined,
						...overrides,
					};
				}) as ProtectedResourceMetadataOutput<T>,
			};
		},
	} satisfies BetterAuthClientPlugin;
};

export interface VerifyAccessTokenRemote {
	/** Full url of the introspect endpoint. Should end with `/oauth2/introspect` */
	introspectUrl: string;
	/** Client Secret */
	clientId: string;
	/** Client Secret */
	clientSecret: string;
	/**
	 * Forces remote verification of a token.
	 * This ensures attached session (if applicable)
	 * is also still active.
	 */
	force?: boolean;
}

type VerifyAccessTokenOutput<T> = T extends Auth
	? (
			token: string | undefined,
			opts?: VerifyAccessTokenAuthOpts,
		) => Promise<JWTPayload>
	: (
			token: string | undefined,
			opts: VerifyAccessTokenNoAuthOpts,
		) => Promise<JWTPayload>;
type VerifyAccessTokenAuthOpts = {
	verifyOptions?: JWTVerifyOptions &
		Required<Pick<JWTVerifyOptions, "audience">>;
	scopes?: string[];
	jwksUrl?: string;
	remoteVerify?: VerifyAccessTokenRemote;
	/** Maps non-url (ie urn, client) resources to resource_metadata */
	resourceMetadataMappings?: Record<string, string>;
};
type VerifyAccessTokenNoAuthOpts =
	| {
			verifyOptions: JWTVerifyOptions &
				Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
			scopes?: string[];
			jwksUrl: string;
			remoteVerify?: VerifyAccessTokenRemote;
			/** Maps non-url (ie urn, client) resources to resource_metadata */
			resourceMetadataMappings?: Record<string, string>;
	  }
	| {
			verifyOptions: JWTVerifyOptions &
				Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
			scopes?: string[];
			jwksUrl?: string;
			remoteVerify: VerifyAccessTokenRemote;
			/** Maps non-url (ie urn, client) resources to resource_metadata */
			resourceMetadataMappings?: Record<string, string>;
	  };

type ProtectedResourceMetadataOutput<T> = T extends Auth
	? (
			overrides?: Partial<ResourceServerMetadata>,
			opts?: {
				silenceWarnings?: {
					oidcScopes?: boolean;
				};
				externalScopes?: string[];
			},
		) => Promise<ResourceServerMetadata>
	: (
			overrides: ResourceServerMetadata,
			opts?: {
				silenceWarnings?: {
					oidcScopes?: boolean;
				};
				externalScopes?: string[];
			},
		) => Promise<ResourceServerMetadata>;
