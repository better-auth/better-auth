import type { Awaitable } from "@better-auth/core";
import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import type {
	DpopReplayStore,
	VerifyAccessTokenRequestOptions,
} from "better-auth/oauth2";
import {
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
		replayStore?: DpopReplayStore;
	};
}

function isLoopbackHost(hostname: string): boolean {
	const ipv4Octets = hostname.split(".");
	const isIpv4Loopback =
		ipv4Octets.length === 4 &&
		ipv4Octets[0] === "127" &&
		ipv4Octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255);
	return hostname === "localhost" || hostname === "[::1]" || isIpv4Loopback;
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
	handler: (
		request: Request,
		accessTokenClaims: JWTPayload,
	) => Awaitable<Response>,
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
			return toChallengeResponse(error, resource, resolvedChallengeOptions);
		}
		try {
			return await handler(request, accessTokenClaims);
		} catch (error) {
			if (isInsufficientScopeError(error)) {
				return toChallengeResponse(error, resource, resolvedChallengeOptions);
			}
			throw error;
		}
	};
};
