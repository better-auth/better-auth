import { logger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type {
	AccessTokenRequestInput,
	VerifyAccessTokenRequestOptions,
} from "better-auth/oauth2";
import {
	DPOP_SIGNING_ALGORITHMS,
	verifyAccessToken,
	verifyAccessTokenRequest,
} from "better-auth/oauth2";
import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
} from "better-auth/types";
import { APIError } from "better-call";
import type { JWTPayload, JWTVerifyOptions } from "jose";
import { raiseResourceServerChallenge } from "./resource-challenge";
import type { ResourceServerMetadata } from "./types/oauth";
import { getJwtPlugin, getOAuthProviderPlugin } from "./utils";
import { PACKAGE_VERSION } from "./version";

type ResourceClientAuth = {
	options: {
		baseURL?: BetterAuthOptions["baseURL"];
		basePath?: BetterAuthOptions["basePath"];
	};
	$context: Promise<unknown>;
};

export const oauthProviderResourceClient = <
	T extends ResourceClientAuth | undefined = undefined,
>(
	auth?: T,
) => {
	let oauthProviderPlugin:
		| ReturnType<typeof getOAuthProviderPlugin>
		| undefined;
	const getOauthProviderPlugin = async () => {
		if (!oauthProviderPlugin) {
			oauthProviderPlugin = auth
				? getOAuthProviderPlugin(
						(await auth.$context) as Parameters<
							typeof getOAuthProviderPlugin
						>[0],
					)
				: undefined;
		}
		return oauthProviderPlugin;
	};
	let jwtPlugin: ReturnType<typeof getJwtPlugin> | undefined;
	const getJwtPluginOptions = async () => {
		if (!jwtPlugin) {
			jwtPlugin =
				auth && !(await getOauthProviderPlugin())?.options?.disableJwtPlugin
					? getJwtPlugin(
							(await auth.$context) as Parameters<typeof getJwtPlugin>[0],
						)
					: undefined;
		}
		return jwtPlugin?.options;
	};
	const authServerBaseUrl =
		typeof auth?.options.baseURL === "string"
			? auth.options.baseURL
			: undefined;
	const getAuthorizationServer = async (): Promise<string | undefined> => {
		const jwtPluginOptions = await getJwtPluginOptions();
		return jwtPluginOptions?.jwt?.issuer ?? authServerBaseUrl;
	};
	const authServerBasePath = auth?.options.basePath;
	const resolveVerifyAccessTokenOptions = async (
		opts:
			| (VerifyAccessTokenAuthOpts & {
					verifyOptions?: JWTVerifyOptions &
						Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
			  })
			| VerifyAccessTokenNoAuthOpts
			| undefined,
	): Promise<VerifyAccessTokenRequestOptions> => {
		const jwtPluginOptions = await getJwtPluginOptions();
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
				? `${authServerBaseUrl + (authServerBasePath ?? "")}${jwtPluginOptions?.jwks?.jwksPath ?? "/jwks"}`
				: undefined);
		const introspectUrl =
			opts?.remoteVerify?.introspectUrl ??
			(authServerBaseUrl
				? `${authServerBaseUrl}${authServerBasePath ?? ""}/oauth2/introspect`
				: undefined);
		return {
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
		};
	};
	const toAccessTokenRequestInput = (
		request: Request | AccessTokenRequestInput,
	): AccessTokenRequestInput => {
		if (request instanceof Request) {
			return {
				authorizationHeader: request.headers.get("authorization"),
				dpopProofJwt: request.headers.get("dpop"),
				method: request.method,
				url: request.url,
			};
		}
		return request;
	};

	return {
		id: "oauth-provider-resource-client",
		version: PACKAGE_VERSION,
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
					const verifyOptions = await resolveVerifyAccessTokenOptions(opts);
					try {
						if (!token?.length) {
							throw new APIError("UNAUTHORIZED", {
								message: "missing authorization header",
							});
						}
						return await verifyAccessToken(token, verifyOptions);
					} catch (error) {
						raiseResourceServerChallenge(
							error,
							verifyOptions.verifyOptions.audience,
							{
								resourceMetadataMappings: opts?.resourceMetadataMappings,
								dpopSigningAlgorithms: DPOP_SIGNING_ALGORITHMS,
							},
						);
					}
				}) as VerifyAccessTokenOutput<T>,
				/**
				 * Performs verification of a protected-resource request. Use this for
				 * new resource-server integrations so sender-constrained DPoP access
				 * tokens are enforced with the request method, URL, Authorization
				 * scheme, DPoP proof, `ath`, and `cnf.jkt` binding.
				 */
				verifyAccessTokenRequest: (async (
					request: Request | AccessTokenRequestInput,
					opts?: {
						verifyOptions?: JWTVerifyOptions &
							Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
						scopes?: string[];
						jwksUrl?: string;
						remoteVerify?: VerifyAccessTokenRemote;
						dpop?: VerifyAccessTokenRequestOptions["dpop"];
						/** Maps non-url (ie urn, client) resources to resource_metadata */
						resourceMetadataMappings?: Record<string, string>;
					},
				): Promise<JWTPayload> => {
					const verifyOptions = await resolveVerifyAccessTokenOptions(opts);
					try {
						return await verifyAccessTokenRequest(
							toAccessTokenRequestInput(request),
							verifyOptions,
						);
					} catch (error) {
						raiseResourceServerChallenge(
							error,
							verifyOptions.verifyOptions.audience,
							{
								resourceMetadataMappings: opts?.resourceMetadataMappings,
								dpopSigningAlgorithms:
									opts?.dpop?.supportedAlgorithms ?? DPOP_SIGNING_ALGORITHMS,
							},
						);
					}
				}) as VerifyAccessTokenRequestOutput<T>,
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
					const oauthProviderOptions = (await getOauthProviderPlugin())
						?.options;
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

					const authorizationServer = await getAuthorizationServer();

					return {
						resource,
						authorization_servers: authorizationServer
							? [authorizationServer]
							: undefined,
						dpop_signing_alg_values_supported: [
							...(oauthProviderOptions?.dpop?.signingAlgorithms ??
								DPOP_SIGNING_ALGORITHMS),
						],
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
	/**
	 * Accept introspection responses that omit the `aud` claim even when a
	 * required `audience` is configured in `verifyOptions`.
	 *
	 * By default verification fails closed: if you configure an `audience` and
	 * the introspection response has no `aud` (or a mismatching one), the token
	 * is rejected. Some authorization servers legitimately omit `aud` from
	 * introspection responses (it is OPTIONAL per RFC 7662 §2.2); only enable
	 * this if you trust the issuer to bind the token to this resource through
	 * another mechanism, as it skips the audience check in that case.
	 *
	 * @default false
	 */
	allowMissingAudience?: boolean;
}

type VerifyAccessTokenOutput<T> = T extends undefined
	? (
			token: string | undefined,
			opts: VerifyAccessTokenNoAuthOpts,
		) => Promise<JWTPayload>
	: (
			token: string | undefined,
			opts?: VerifyAccessTokenAuthOpts,
		) => Promise<JWTPayload>;
type VerifyAccessTokenRequestOutput<T> = T extends undefined
	? (
			request: Request | AccessTokenRequestInput,
			opts: VerifyAccessTokenRequestNoAuthOpts,
		) => Promise<JWTPayload>
	: (
			request: Request | AccessTokenRequestInput,
			opts?: VerifyAccessTokenRequestAuthOpts,
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
type VerifyAccessTokenRequestAuthOpts = VerifyAccessTokenAuthOpts & {
	dpop?: VerifyAccessTokenRequestOptions["dpop"];
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
type VerifyAccessTokenRequestNoAuthOpts = VerifyAccessTokenNoAuthOpts & {
	dpop?: VerifyAccessTokenRequestOptions["dpop"];
};

type ProtectedResourceMetadataOutput<T> = T extends undefined
	? (
			overrides: ResourceServerMetadata,
			opts?: {
				silenceWarnings?: {
					oidcScopes?: boolean;
				};
				externalScopes?: string[];
			},
		) => Promise<ResourceServerMetadata>
	: (
			overrides?: Partial<ResourceServerMetadata>,
			opts?: {
				silenceWarnings?: {
					oidcScopes?: boolean;
				};
				externalScopes?: string[];
			},
		) => Promise<ResourceServerMetadata>;
