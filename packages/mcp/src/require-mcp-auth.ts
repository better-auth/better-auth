import type { AuthContext, Awaitable } from "@better-auth/core";
import {
	getLocalIntrospection,
	getLocalJwksSource,
} from "@better-auth/oauth-provider/internal";
import type {
	DpopReplayAuthContext,
	DpopReplayStore,
} from "better-auth/oauth2";
import { createDpopReplayStore } from "better-auth/oauth2";
import type { BetterAuthOptions } from "better-auth/types";
import type { JWTPayload } from "jose";
import { createProtectedRequestHandler, validateMcpResource } from "./handler";

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
	 * URL of the authorization server's JWKS. When set, JWT access tokens are
	 * verified by signature against these keys alone, which does not see
	 * revocation or an ended session, and opaque tokens are rejected. When
	 * unset and the OAuth provider runs in this process, tokens are checked
	 * against its records. Without that provider, JWT access tokens are verified
	 * by signature against the JWT plugin's keys, read in-process, or fetched from
	 * `jwks.remoteUrl` when the plugin publishes them there.
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
		/**
		 * Require server-provided nonces in DPoP proofs (RFC 9449 §9). A proof
		 * without a current nonce gets a `401` `use_dpop_nonce` challenge with a
		 * fresh `DPoP-Nonce`, and successful DPoP responses carry the next one.
		 *
		 * Nonces are derived from the auth instance's secret, the same way the
		 * OAuth provider's `dpop.nonce` derives them, so the MCP server accepts
		 * the nonces the provider issues. Pass `secret` only to keep the MCP
		 * server's nonces separate, such as for an MCP server on its own origin.
		 */
		nonce?: {
			required: boolean;
			/**
			 * Seconds a nonce is accepted after it is issued. Defaults to the OAuth
			 * provider's `dpop.nonce.expiresIn`, then to `300`.
			 */
			expiresIn?: number;
			/** Defaults to the auth instance's secret. */
			secret?: string;
		};
	};
}

/** The OAuth provider's `dpop.nonce.expiresIn`, which `mcp()` passes through. */
function getProviderNonceExpiresIn(
	options: BetterAuthOptions,
): number | undefined {
	const provider = options.plugins?.find(
		(plugin) => plugin.id === "oauth-provider",
	) as { options?: { dpop?: { nonce?: { expiresIn?: number } } } } | undefined;
	return provider?.options?.dpop?.nonce?.expiresIn;
}

/**
 * Protects an MCP server route handler. Checks the bearer access token against
 * the OAuth provider's records in-process (JWT or opaque; ended sessions,
 * disabled clients, and revoked opaque tokens fail, and so do revoked JWTs
 * with `revocableJwtAccessTokens`), verifies issuer, audience, and
 * expiry, and forwards the token's claims to the handler. Their `sub` is the
 * subject the token carries; a pairwise client's opaque token gets its
 * pairwise subject.
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
		$context: Promise<
			Pick<AuthContext, "baseURL" | "getPlugin"> &
				DpopReplayAuthContext & {
					secret?: string;
				}
		>;
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
		const authContext = await auth.$context;
		const { baseURL, secret } = authContext;
		if (!baseURL) {
			throw new Error(
				"requireMcpAuth requires a resolvable base URL. For dynamic base URLs use `createMcpProtectedRequestHandler` with explicit verification options.",
			);
		}
		const nonce = opts?.dpop?.nonce;
		const nonceSecret = nonce?.secret ?? secret;
		if (nonce?.required && !nonceSecret) {
			throw new Error(
				"requireMcpAuth requires dpop.nonce.secret when the auth context has no secret.",
			);
		}
		const issuer = opts?.issuer ?? baseURL;
		const resource = opts?.resource ?? baseURL;
		// The provider in this process checks the token against its own records,
		// which accepts opaque tokens and rejects revoked ones, without a request
		// to its own endpoints.
		const introspect = opts?.jwksUrl
			? undefined
			: getLocalIntrospection(
					authContext as Parameters<typeof getLocalIntrospection>[0],
					req,
					// The subjects the token carries, so a pairwise client's tokens
					// never reveal the user ID.
					{ subject: "token" },
				);
		const jwtPlugin = authContext.getPlugin("jwt");
		const localJwks =
			introspect || opts?.jwksUrl
				? undefined
				: getLocalJwksSource(
						authContext as Parameters<typeof getLocalJwksSource>[0],
						req,
					);
		// The JWT plugin disables its `/jwks` endpoint when keys are published at
		// `jwks.remoteUrl`.
		const jwksUrl =
			opts?.jwksUrl ?? jwtPlugin?.options?.jwks?.remoteUrl ?? `${baseURL}/jwks`;
		return createProtectedRequestHandler(
			{
				...localJwks,
				introspect,
				issuer,
				audience: resource,
				// Every access token the provider issues names its client in `azp`.
				// Session JWTs signed with the same keys do not.
				jwtVerifyOptions: { requiredClaims: ["azp"] },
				requiredScopes: opts?.requiredScopes,
				challengeScopes: opts?.challengeScopes,
				isScopeSatisfied: opts?.isScopeSatisfied,
				jwksUrl,
				dpop: {
					proofMaxAgeSeconds: opts?.dpop?.proofMaxAgeSeconds,
					signingAlgorithms: opts?.dpop?.signingAlgorithms,
					// Default to the auth instance's shared store so proof replay is
					// rejected across instances, not just within one process.
					replayStore:
						opts?.dpop?.replayStore ?? createDpopReplayStore(authContext),
					nonce:
						nonce && nonceSecret
							? {
									required: nonce.required,
									expiresIn:
										nonce.expiresIn ?? getProviderNonceExpiresIn(auth.options),
									secret: nonceSecret,
								}
							: undefined,
				},
			},
			handler,
		)(req);
	};
};
