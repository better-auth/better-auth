import type { Awaitable } from "@better-auth/core";
import {
	ResourceUriSchema,
	raiseResourceServerChallenge,
} from "@better-auth/oauth-provider";
import type {
	DpopReplayReservations,
	DpopReplayStore,
} from "better-auth/oauth2";
import {
	createDpopReplayStore,
	requestToResourceInput,
	verifyAccessTokenRequest,
} from "better-auth/oauth2";
import type { BetterAuthOptions } from "better-auth/types";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";

interface RequireMcpAuthOptions {
	/**
	 * The protected resource identifier the access token must be bound to.
	 * Defaults to the server's resolved base URL.
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
	/**
	 * Maps a non-URL `resource` (an RFC 8707 `urn:` identifier or a client id) to
	 * the URL of its protected resource metadata. Required when `resource` is not
	 * an origin-based URL, so the `WWW-Authenticate` challenge can point at it.
	 */
	resourceMetadataMappings?: Record<string, string>;
	/**
	 * DPoP proof validation settings. By default the replay store is backed by
	 * the auth instance's database adapter, so anti-replay holds across multiple
	 * server instances. Override `replayStore` only to point at a different store.
	 */
	dpop?: {
		proofMaxAgeSeconds?: number;
		signingAlgorithms?: readonly string[];
		replayStore?: DpopReplayStore;
	};
}

const unauthorized = (error: APIError): Response => {
	const headers = new Headers(error.headers as HeadersInit);
	headers.set("Content-Type", "application/json");
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code: -32000, message: error.message },
			id: null,
		}),
		{
			status: error.statusCode,
			headers,
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
		$context: Promise<{
			baseURL: string;
			internalAdapter: DpopReplayReservations;
		}>;
	},
>(
	auth: Auth,
	handler: (req: Request, jwt: JWTPayload) => Awaitable<Response>,
	opts?: RequireMcpAuthOptions,
) => {
	if (opts?.resource !== undefined) {
		// RFC 8707 / RFC 9728: reject a non-absolute or fragment-containing
		// resource up front, so it never reaches the metadata URL or audience
		// verifier.
		ResourceUriSchema.parse(opts.resource);
	}
	return async (req: Request): Promise<Response> => {
		// The provider stamps tokens with its resolved base URL (which includes
		// the base path) as both issuer and default resource. Read that value from
		// the auth context so the verified issuer and audience match what the
		// provider issued. Override via `opts` for a custom `jwt.issuer`, a
		// distinct resource, or a non-default JWKS location.
		const { baseURL, internalAdapter } = await auth.$context;
		if (!baseURL) {
			throw new Error(
				"requireMcpAuth requires a resolvable base URL. For dynamic base URLs use `mcpHandler` with explicit verify options.",
			);
		}
		const issuer = opts?.issuer ?? baseURL;
		const resource = opts?.resource ?? baseURL;
		const jwksUrl = opts?.jwksUrl ?? `${baseURL}/jwks`;
		try {
			const jwt = await verifyAccessTokenRequest(requestToResourceInput(req), {
				verifyOptions: { issuer, audience: resource },
				jwksUrl,
				dpop: {
					proofMaxAgeSeconds: opts?.dpop?.proofMaxAgeSeconds,
					signingAlgorithms: opts?.dpop?.signingAlgorithms,
					// Default to the database-backed store so proof replay is
					// rejected across instances, not just within one process.
					replayStore:
						opts?.dpop?.replayStore ?? createDpopReplayStore(internalAdapter),
				},
			});
			return handler(req, jwt);
		} catch (error) {
			try {
				raiseResourceServerChallenge(error, resource, {
					scope: opts?.scope,
					resourceMetadataMappings: opts?.resourceMetadataMappings,
					dpopSigningAlgorithms: opts?.dpop?.signingAlgorithms,
				});
			} catch (challengeError) {
				if (challengeError instanceof APIError) {
					return unauthorized(challengeError);
				}
				if (challengeError instanceof Error) throw challengeError;
				throw new Error(String(challengeError));
			}
			throw new Error(String(error));
		}
	};
};
