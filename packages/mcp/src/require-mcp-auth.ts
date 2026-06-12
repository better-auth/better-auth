import type { Awaitable } from "@better-auth/core";
import { ResourceUriSchema } from "@better-auth/oauth-provider";
import { verifyAccessToken } from "better-auth/oauth2";
import type { BetterAuthOptions } from "better-auth/types";
import type { JWTPayload } from "jose";

interface RequireMcpAuthOptions {
	/**
	 * The protected resource identifier the access token must be audience-bound
	 * to. Defaults to the server's resolved base URL.
	 */
	resource?: string;
	/**
	 * Expected token issuer. Defaults to the server's resolved base URL. Override
	 * when the JWT plugin is configured with a custom `jwt.issuer`.
	 */
	issuer?: string;
	/**
	 * URL of the authorization server's JWKS. Defaults to `/jwks` under the
	 * server's resolved base URL.
	 */
	jwksUrl?: string;
	/**
	 * Space-delimited scopes to advertise in the `WWW-Authenticate` challenge
	 * (RFC 6750), hinting which scopes the client should request.
	 */
	scope?: string;
}

const unauthorized = (
	message: string,
	resourceMetadata: string,
	scope?: string,
): Response => {
	let challenge = `Bearer resource_metadata="${resourceMetadata}"`;
	if (scope) {
		challenge += `, scope="${scope}"`;
	}
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code: -32000, message },
			id: null,
		}),
		{
			status: 401,
			headers: {
				"Content-Type": "application/json",
				"WWW-Authenticate": challenge,
			},
		},
	);
};

/**
 * Protects an MCP server route handler. Verifies the bearer access token
 * against the authorization server's JWKS (checking signature, issuer,
 * audience, and expiry) and forwards the verified JWT payload to the handler.
 * Unauthenticated requests receive a JSON-RPC 401 with the RFC 9728
 * `WWW-Authenticate` header so MCP clients can start the authorization flow.
 *
 * For a resource server that runs separately from the authorization server, or
 * a server using a dynamic `baseURL`, use {@link mcpHandler} with explicit
 * verification options instead.
 *
 * @external
 */
export const requireMcpAuth = <
	Auth extends {
		options: BetterAuthOptions;
		$context: Promise<{ baseURL: string }>;
	},
>(
	auth: Auth,
	handler: (req: Request, jwt: JWTPayload) => Awaitable<Response>,
	opts?: RequireMcpAuthOptions,
) => {
	if (opts?.resource !== undefined) {
		// RFC 8707 / RFC 9728: reject a non-absolute or fragment-containing
		// resource up front, so it never reaches the metadata URL or the audience.
		ResourceUriSchema.parse(opts.resource);
	}
	return async (req: Request): Promise<Response> => {
		// The provider stamps tokens with, and binds their audience to, its
		// resolved base URL (which includes the base path). Read that value from
		// the auth context so the verified issuer and audience match what the
		// provider issued. Override via `opts` for a custom `jwt.issuer`, a
		// distinct resource, or a non-default JWKS location.
		const { baseURL } = await auth.$context;
		if (!baseURL) {
			throw new Error(
				"requireMcpAuth requires a resolvable base URL. For dynamic base URLs use `mcpHandler` with explicit verify options.",
			);
		}
		const issuer = opts?.issuer ?? baseURL;
		const resource = opts?.resource ?? baseURL;
		const jwksUrl = opts?.jwksUrl ?? `${baseURL}/jwks`;
		// RFC 9728: insert the resource path after the well-known segment. The
		// provider serves the document at this root-mounted location.
		const resourceUrl = new URL(resource);
		const resourcePath =
			resourceUrl.pathname === "/"
				? ""
				: resourceUrl.pathname.replace(/\/$/, "");
		const resourceMetadata = `${resourceUrl.origin}/.well-known/oauth-protected-resource${resourcePath}${resourceUrl.search}`;

		const authorization = req.headers?.get("authorization") ?? undefined;
		const accessToken = authorization?.startsWith("Bearer ")
			? authorization.slice("Bearer ".length)
			: authorization;
		if (!accessToken?.length) {
			return unauthorized(
				"Unauthorized: Authentication required",
				resourceMetadata,
				opts?.scope,
			);
		}
		try {
			const jwt = await verifyAccessToken(accessToken, {
				verifyOptions: { issuer, audience: resource },
				jwksUrl,
			});
			return handler(req, jwt);
		} catch {
			return unauthorized(
				"Unauthorized: invalid token",
				resourceMetadata,
				opts?.scope,
			);
		}
	};
};
