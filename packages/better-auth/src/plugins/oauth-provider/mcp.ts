import type { oauthProvider } from "../oauth-provider";
import {
	handleMcpErrors,
	McpUnauthenticatedError,
} from "../../oauth-2.1/errors";
import type { ResourceServerMetadata } from "../../oauth-2.1/types";
import type { AuthContext, GenericEndpointContext } from "../../types";
import type { Awaitable } from "../../types/helper";
import { getJwtPlugin } from "./utils";
import {
	createLocalJWKSet,
	jwtVerify,
	type JSONWebKeySet,
	type JWTPayload,
} from "jose";
import { APIError } from "better-call";

const getOAuthProviderPlugin = (ctx: AuthContext) => {
	return ctx.options.plugins?.find(
		(plugin) => plugin.id === "oauthProvider",
	) as ReturnType<typeof oauthProvider>;
};

/**
 * A generalized function that checks for an access token's validity
 * and will work for most platforms.
 */
export const checkMcp = async <
	Auth extends AuthContext & {
		api?: {
			getJwks: () => Promise<JSONWebKeySet>;
			oAuth2introspect: (
				ctx: Partial<GenericEndpointContext>,
			) => Promise<JWTPayload>;
		};
	},
>({
	auth,
	clientId,
	clientSecret,
	accessToken,
	baseUrl,
	path,
	forceServerValidation,
	scopes,
}: {
	auth: Auth;
	clientId: string;
	clientSecret: string;
	accessToken?: string;
	baseUrl: string;
	path?: string;
	forceServerValidation?: boolean;
	/** If supplied, checks whether scopes are valid */
	scopes?: string[];
}) => {
	if (accessToken?.startsWith("Bearer ")) {
		accessToken = accessToken?.replace("Bearer ", "");
	}
	if (!accessToken?.length) {
		throw new APIError("BAD_REQUEST", {
			message: "missing token",
		});
	}

	const oAuthPlugin = getOAuthProviderPlugin(auth);
	let jwtPayload: JWTPayload | undefined;

	// Try local validation
	if (!forceServerValidation && !oAuthPlugin.options.disableJWTPlugin) {
		// Get Jwks
		const jwtPlugin = getJwtPlugin(auth);
		const jwksResult = jwtPlugin.options?.jwks?.remoteUrl
			? await fetch(jwtPlugin.options.jwks.remoteUrl, {
					headers: {
						Accept: "application/json",
					},
				}).then(async (res) => {
					if (!res.ok) throw new Error(`Jwks error: status ${res.status}`);
					return (await res.json()) as JSONWebKeySet | undefined;
				})
			: await auth.api?.getJwks();
		if (!jwksResult) throw new Error("No jwks found");
		const jwks = createLocalJWKSet(jwksResult);
		// Verify using jwks
		try {
			const jwt = await jwtVerify(accessToken, jwks, {
				audience: jwtPlugin.options?.jwt?.audience ?? auth.options.baseURL,
				issuer: jwtPlugin.options?.jwt?.issuer ?? auth.options.baseURL,
			});
			jwtPayload = jwt.payload;
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === "JWTExpired") {
					throw new McpUnauthenticatedError("token expired", baseUrl, path);
				} else if (error.name === "JWTClaimValidationFailed") {
					throw new McpUnauthenticatedError(
						"jwt invalid due to audience or issuer mismatch",
						baseUrl,
						path,
					);
				} else if (error.name === "JWKSNoMatchingKey") {
					throw new McpUnauthenticatedError(
						"no matching key in jwks",
						baseUrl,
						path,
					);
				} else if (error.name === "JWSInvalid") {
					// continue - likely an opaque token
				} else {
					throw error;
				}
			} else {
				throw new Error(error as unknown as string);
			}
		}
	}

	// Remote introspect
	if (!jwtPayload) {
		const introspect = await auth.api?.oAuth2introspect({
			method: "POST",
			body: {
				client_id: clientId,
				client_secret: clientSecret,
				token: accessToken,
				token_type_hint: "access_token",
			},
		});
		jwtPayload = introspect;
	}

	// Payload should exist by here
	if (!jwtPayload) throw new APIError("INTERNAL_SERVER_ERROR");

	// Verify scopes
	if (scopes) {
		const payloadScopes: string[] | undefined = (
			jwtPayload?.scope as string | undefined
		)?.split(" ");
		if (!payloadScopes?.length) {
			throw new APIError("FORBIDDEN");
		}
		for (const sc of scopes) {
			if (!payloadScopes.includes(sc)) {
				throw new APIError("FORBIDDEN");
			}
		}
	}

	return {
		jwt: jwtPayload,
	};
};

/**
 * A request middleware handler that checks and responds with
 * a www-authenticate header for unauthenticated responses.
 *
 * Passes through authenticated tokens.
 * Provides valid Jwt payloads on `req.context.jwt`.
 */
export const mcpHandler = <
	Auth extends AuthContext,
	Request extends {
		readonly url: string;
		readonly headers: Headers;
		context?: {
			jwt?: JWTPayload;
			jwt_raw?: string;
		};
	},
>(
	auth: Auth,
	handler: (req: Request) => Awaitable<Response>,
	opts: {
		clientId: string;
		clientSecret: string;
		scopes?: string[];
		forceServerValidation?: boolean;
	},
) => {
	return async (req: Request) => {
		const url = new URL(req.url);
		const baseUrl =
			url.protocol + "//" + url.hostname + (url.port ? ":" + url.port : "");
		let path = url.pathname;
		if (path.endsWith("/")) path = path.slice(0, -1);

		const authorization = req.headers?.get("authorization") ?? undefined;
		const accessToken = authorization?.startsWith("Bearer ")
			? authorization.replace("Bearer ", "")
			: authorization;
		try {
			const token = await checkMcp({
				...opts,
				auth,
				accessToken,
				baseUrl,
				path,
			});
			if (!req.context) req.context = {};
			req.context.jwt = token;
		} catch (error) {
			return handleMcpErrors(error);
		}
		return handler(req);
	};
};

/**
 * Creates a discovery endpoint on an MCP
 * resource server about its MCP auth server.
 */
export const oAuthDiscoveryMetadata = <Auth extends AuthContext>(
	auth: Auth,
	metadata?: ResourceServerMetadata,
) => {
	return async (req: Request) => {
		const mcpMetadata = metadata;
		if (!mcpMetadata) {
			return new Response(
				JSON.stringify({
					message: "endpoint missing metadata",
				}),
				{
					status: 400,
				},
			);
		}

		// Check authorization_servers
		let authorizationServers = mcpMetadata.authorization_servers;
		const baseUrl = auth.options.baseURL;
		if (!authorizationServers) {
			authorizationServers = [
				`${baseUrl}/.well-known/oauth-authorization-server`,
			];
		}
		if (!authorizationServers.length) {
			return new Response(
				JSON.stringify({
					message: "at least one authorization server is required",
				}),
				{
					status: 400,
				},
			);
		}

		const mcpOverridesMetadata: ResourceServerMetadata = {
			...mcpMetadata,
			authorization_servers: authorizationServers,
		};
		return new Response(JSON.stringify(mcpOverridesMetadata), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				// We should cache here because it is unlikely this will
				// change frequently and if it does shouldn't be more than
				// for 15 seconds in a change period
				"Cache-Control":
					"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400", // 15 sec
			},
		});
	};
};
