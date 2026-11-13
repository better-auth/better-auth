import type { Awaitable } from "@better-auth/core";
import { isLoopbackHost } from "@better-auth/core/utils/host";
import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { withExposedHeaders } from "@better-auth/oauth-provider/internal";
import type {
	DpopReplayStore,
	VerifyAccessTokenOptions,
	VerifyAccessTokenRequestOptions,
} from "better-auth/oauth2";
import {
	createDpopNonce,
	DPOP_NONCE_HEADER,
	getDpopJktFromPayload,
	isInsufficientScopeError,
	requestToResourceInput,
	verifyAccessTokenRequest,
} from "better-auth/oauth2";
import type { JWTPayload, JWTVerifyOptions } from "jose";

export interface McpProtectedRequestHandlerOptions {
	/** Expected authorization-server issuer for the access token. */
	issuer: string;
	/** Canonical MCP protected-resource URL expected in the token audience. */
	audience: string;
	/**
	 * Additional JOSE verification constraints. `issuer` and `audience` remain
	 * authoritative from the top-level fields.
	 */
	jwtVerifyOptions?: Omit<JWTVerifyOptions, "issuer" | "audience">;
	/** URL of the authorization server's JSON Web Key Set. */
	jwksUrl?: string;
	/** Remote introspection settings for opaque or remotely checked tokens. */
	remoteVerify?: {
		introspectUrl: string;
		clientId: string;
		clientSecret: string;
		force?: boolean;
		allowMissingAudience?: boolean;
	};
	/** Scopes every accepted access token must satisfy. */
	requiredScopes?: readonly string[];
	/**
	 * Scopes to advertise in unauthenticated `WWW-Authenticate` challenges.
	 * Defaults to `requiredScopes`.
	 */
	challengeScopes?: readonly string[];
	/** Custom required-scope matcher. Defaults to exact membership. */
	isScopeSatisfied?: (
		requiredScope: string,
		grantedScopes: ReadonlySet<string>,
	) => boolean;
	/** DPoP proof validation and replay-protection settings. */
	dpop?: {
		proofMaxAgeSeconds?: number;
		signingAlgorithms?: readonly string[];
		/**
		 * Store that rejects a DPoP proof that was already used.
		 *
		 * Unlike `requireMcpAuth`, this handler has no auth instance to store
		 * proofs in, so it defaults to a process-local in-memory store. That is
		 * safe only for a single long-lived instance. For multiple instances or
		 * serverless, pass a shared store, such as
		 * `createDpopReplayStore((await auth.$context).internalAdapter)` from
		 * `better-auth/oauth2`. With secondary storage, that store also needs
		 * `verification.storeInDatabase: true`, or every DPoP request fails.
		 */
		replayStore?: DpopReplayStore;
		/**
		 * Require server-provided nonces in DPoP proofs (RFC 9449 §9). A proof
		 * without a current nonce gets a `401` `use_dpop_nonce` challenge with a
		 * fresh `DPoP-Nonce`, and successful DPoP responses carry the next one.
		 * Responses that carry a nonce are marked `Cache-Control: no-store`. Use
		 * the authorization server's secret to accept the nonces it issues, such
		 * as when the MCP server shares its origin.
		 */
		nonce?: NonNullable<VerifyAccessTokenRequestOptions["dpop"]>["nonce"];
	};
}

/**
 * Validates the canonical protected-resource identifier accepted by MCP.
 *
 * @internal
 */
export function validateMcpResource(resource: unknown): string {
	if (typeof resource !== "string") {
		throw new TypeError("MCP resource must be a single URL string");
	}
	let url: URL;
	try {
		url = new URL(resource);
	} catch {
		throw new TypeError("MCP resource must be an absolute URL");
	}
	if (url.username || url.password) {
		throw new TypeError("MCP resource URL must not contain credentials");
	}
	if (resource.includes("#")) {
		throw new TypeError("MCP resource URL must not contain a fragment");
	}
	if (resource.includes("?")) {
		throw new TypeError(
			"MCP resource URL must not contain a query; to protect a query-carrying resource, verify tokens with verifyAccessTokenRequest and build challenges with createResourceServerChallenge",
		);
	}
	if (
		url.protocol !== "https:" &&
		!(url.protocol === "http:" && isLoopbackHost(url.hostname))
	) {
		throw new TypeError(
			"MCP resource URL must use HTTPS, except for localhost or loopback IP development URLs",
		);
	}
	return resource;
}

/**
 * Returns `response` with the next DPoP nonce (RFC 9449 §8.2). The response
 * gets `Cache-Control: no-store`, overriding the handler's policy, because a
 * cached copy would hand clients the nonce after it expires. The headers are copied
 * because a handler's `Response` may have immutable headers.
 */
async function withNextDpopNonce(
	response: Response,
	secret: string,
): Promise<Response> {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");
	headers.set(DPOP_NONCE_HEADER, await createDpopNonce({ secret }));
	headers.set(
		"Access-Control-Expose-Headers",
		withExposedHeaders(
			headers.get("access-control-expose-headers"),
			DPOP_NONCE_HEADER,
		),
	);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function toChallengeResponse(
	error: unknown,
	resource: string,
	opts?: Parameters<typeof createResourceServerChallenge>[2],
): Response {
	const challenge = createResourceServerChallenge(error, resource, opts);
	if (!challenge) throw error;
	const headers = new Headers(challenge.headers as HeadersInit);
	headers.set("Content-Type", "application/json");
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code: -32000, message: challenge.message },
			id: null,
		}),
		{ status: challenge.statusCode, headers },
	);
}

type McpRequestHandler = (
	request: Request,
	accessTokenClaims: JWTPayload,
) => Awaitable<Response>;

/**
 * A request middleware handler that verifies an MCP access token and responds
 * with an RFC 9728 `WWW-Authenticate` header for unauthenticated requests.
 * When `options.requiredScopes` is set, tokens missing a required scope receive
 * a 403 with an RFC 6750 `insufficient_scope` challenge naming them instead.
 *
 * @external
 */
export const createMcpProtectedRequestHandler = (
	options: McpProtectedRequestHandlerOptions,
	handler: McpRequestHandler,
) => createProtectedRequestHandler(options, handler);

/**
 * {@link createMcpProtectedRequestHandler} that can also read the
 * authorization server's keys in-process.
 *
 * @internal
 */
export const createProtectedRequestHandler = (
	options: McpProtectedRequestHandlerOptions &
		Pick<VerifyAccessTokenOptions, "jwksFetch" | "jwksCacheKey">,
	handler: McpRequestHandler,
) => {
	const resource = validateMcpResource(options.audience);
	const resolvedChallengeOptions = {
		challengeScopes: options.challengeScopes ?? options.requiredScopes,
		dpopSigningAlgorithms: options.dpop?.signingAlgorithms,
	};
	const accessTokenVerificationOptions: VerifyAccessTokenRequestOptions = {
		verifyOptions: {
			...options.jwtVerifyOptions,
			issuer: options.issuer,
			audience: options.audience,
		},
		jwksUrl: options.jwksUrl,
		jwksFetch: options.jwksFetch,
		jwksCacheKey: options.jwksCacheKey,
		remoteVerify: options.remoteVerify,
		requiredScopes: options.requiredScopes,
		isScopeSatisfied: options.isScopeSatisfied,
		dpop: options.dpop,
	};
	return async (request: Request) => {
		let accessTokenClaims: JWTPayload;
		try {
			accessTokenClaims = await verifyAccessTokenRequest(
				requestToResourceInput(request),
				accessTokenVerificationOptions,
			);
		} catch (error) {
			return toChallengeResponse(error, resource, {
				...resolvedChallengeOptions,
				request,
			});
		}
		let response: Response;
		try {
			response = await handler(request, accessTokenClaims);
		} catch (error) {
			if (isInsufficientScopeError(error)) {
				return toChallengeResponse(error, resource, {
					...resolvedChallengeOptions,
					request,
				});
			}
			throw error;
		}
		const nonce = options.dpop?.nonce;
		return nonce?.required && getDpopJktFromPayload(accessTokenClaims)
			? withNextDpopNonce(response, nonce.secret)
			: response;
	};
};
