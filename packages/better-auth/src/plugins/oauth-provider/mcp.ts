import type { oauthProvider } from "../oauth-provider";
import { handleMcpErrors } from "../../oauth-2.1/errors";
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
	forceServerValidation,
	scopes,
}: {
	auth: Auth;
	clientId: string;
	clientSecret: string;
	accessToken?: string;
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
					throw new APIError("UNAUTHORIZED", {
						message: "token expired",
					});
				} else if (error.name === "JWTClaimValidationFailed") {
					throw new APIError("UNAUTHORIZED", {
						message: "jwt invalid due to audience or issuer mismatch",
					});
				} else if (error.name === "JWKSNoMatchingKey") {
					throw new APIError("UNAUTHORIZED", {
						message: "no matching key in jwks",
					});
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
		const authorization = req.headers?.get("authorization") ?? undefined;
		const accessToken = authorization?.startsWith("Bearer ")
			? authorization.replace("Bearer ", "")
			: authorization;
		try {
			const token = await checkMcp({
				...opts,
				auth,
				accessToken,
			});
			if (!req.context) req.context = {};
			req.context.jwt = token;
		} catch (error) {
			return handleMcpErrors(error, {
				baseUrl: auth.options.baseURL ?? auth.baseURL,
				path: auth.options.basePath,
			});
		}
		return handler(req);
	};
};
