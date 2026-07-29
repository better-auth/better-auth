import type { Awaitable } from "@better-auth/core";
import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import {
	isInsufficientScopeError,
	requestToResourceInput,
	verifyAccessTokenRequest,
} from "better-auth/oauth2";
import type { JWTPayload } from "jose";

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
		throw new TypeError("MCP resource URL must not contain a query");
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
	resource: string | string[],
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
 * When `verifyOptions.requiredScopes` is set, tokens missing a required scope receive
 * a 403 with an RFC 6750 `insufficient_scope` challenge naming them instead.
 *
 * @external
 */
export const mcpHandler = (
	/** Verifier options. `audience` must match the protected resource identifier. */
	verifyOptions: Parameters<typeof verifyAccessTokenRequest>[1],
	handler: (req: Request, jwt: JWTPayload) => Awaitable<Response>,
	opts?: {
		/** Scopes to advertise in `WWW-Authenticate` challenges (RFC 6750). */
		challengeScopes?: readonly string[];
	},
) => {
	const resource = validateMcpResource(verifyOptions.verifyOptions.audience);
	const challengeOptions = {
		...opts,
		challengeScopes: opts?.challengeScopes ?? verifyOptions.requiredScopes,
		dpopSigningAlgorithms: verifyOptions.dpop?.signingAlgorithms,
	};
	return async (req: Request) => {
		let token: JWTPayload;
		try {
			token = await verifyAccessTokenRequest(
				requestToResourceInput(req),
				verifyOptions,
			);
		} catch (error) {
			return toChallengeResponse(error, resource, challengeOptions);
		}
		try {
			return await handler(req, token);
		} catch (error) {
			if (isInsufficientScopeError(error)) {
				return toChallengeResponse(error, resource, challengeOptions);
			}
			throw error;
		}
	};
};
