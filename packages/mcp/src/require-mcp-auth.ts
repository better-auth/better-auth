import type { Awaitable } from "@better-auth/core";
import type {
	DpopReplayReservations,
	DpopReplayStore,
} from "better-auth/oauth2";
import { createDpopReplayStore } from "better-auth/oauth2";
import type { BetterAuthOptions } from "better-auth/types";
import type { JWTPayload } from "jose";
import {
	createMcpProtectedRequestHandler,
	validateMcpResource,
} from "./handler";

export interface RequireMcpAuthOptions {
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
	 * Scopes to advertise in the `WWW-Authenticate` challenge (RFC 6750),
	 * hinting which scopes the client should request. Defaults to the enforced
	 * `requiredScopes` when those are set.
	 */
	challengeScopes?: readonly string[];
	/**
	 * Scopes the access token must include, enforced against the token's
	 * `scope` claim. A token missing any of them is rejected with a 403 and an
	 * RFC 6750 `insufficient_scope` challenge naming every missing scope, so MCP
	 * clients can step up their authorization in one round-trip.
	 */
	requiredScopes?: readonly string[];
	/** Custom required-scope matcher. Defaults to exact membership. */
	isScopeSatisfied?: (
		requiredScope: string,
		grantedScopes: ReadonlySet<string>,
	) => boolean;
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

/**
 * Protects an MCP server route handler. Verifies the bearer access token
 * against the authorization server's JWKS (checking signature, issuer,
 * audience, and expiry) and forwards the verified JWT payload to the handler.
 * Unauthenticated requests receive a JSON-RPC 401 with the RFC 9728
 * `WWW-Authenticate` header so MCP clients can start the authorization flow.
 * Tokens missing a required scope receive a 403 with an RFC 6750
 * `insufficient_scope` challenge naming the missing scopes, so clients can step
 * up their authorization; a handler can raise the same challenge for scopes only
 * it knows about by throwing `createInsufficientScopeError`.
 *
 * For a resource server that runs separately from the authorization server, or
 * a server using a dynamic `baseURL`, use
 * {@link createMcpProtectedRequestHandler} with explicit verification options
 * instead.
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
	handler: (
		request: Request,
		accessTokenClaims: JWTPayload,
	) => Awaitable<Response>,
	opts?: RequireMcpAuthOptions,
) => {
	if (opts?.resource !== undefined) {
		validateMcpResource(opts.resource);
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
				"requireMcpAuth requires a resolvable base URL. For dynamic base URLs use `createMcpProtectedRequestHandler` with explicit verification options.",
			);
		}
		const issuer = opts?.issuer ?? baseURL;
		const resource = opts?.resource ?? baseURL;
		const jwksUrl = opts?.jwksUrl ?? `${baseURL}/jwks`;
		return createMcpProtectedRequestHandler(
			{
				issuer,
				audience: resource,
				requiredScopes: opts?.requiredScopes,
				challengeScopes: opts?.challengeScopes,
				isScopeSatisfied: opts?.isScopeSatisfied,
				jwksUrl,
				dpop: {
					proofMaxAgeSeconds: opts?.dpop?.proofMaxAgeSeconds,
					signingAlgorithms: opts?.dpop?.signingAlgorithms,
					// Default to the database-backed store so proof replay is
					// rejected across instances, not just within one process.
					replayStore:
						opts?.dpop?.replayStore ?? createDpopReplayStore(internalAdapter),
				},
			},
			handler,
		)(req);
	};
};
