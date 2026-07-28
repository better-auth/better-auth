import type { Awaitable } from "@better-auth/core";
import { raiseResourceServerChallenge } from "@better-auth/oauth-provider";
import {
	requestToResourceInput,
	verifyAccessTokenRequest,
} from "better-auth/oauth2";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";

/**
 * A request middleware handler that verifies an MCP access token and responds
 * with an RFC 9728 `WWW-Authenticate` header for unauthenticated requests.
 * When `verifyOptions.scopes` is set, tokens missing a required scope receive
 * a 403 with an RFC 6750 `insufficient_scope` challenge instead.
 *
 * @external
 */
export const mcpHandler = (
	/** Verifier options. `audience` must match the protected resource identifier. */
	verifyOptions: Parameters<typeof verifyAccessTokenRequest>[1],
	handler: (req: Request, jwt: JWTPayload) => Awaitable<Response>,
	opts?: {
		/** Maps non-url (ie urn, client) resources to resource_metadata */
		resourceMetadataMappings?: Record<string, string>;
		/**
		 * Space-delimited scopes to advertise in `WWW-Authenticate` challenges
		 * (RFC 6750). Defaults to `verifyOptions.scopes` when those are set.
		 */
		scope?: string;
	},
) => {
	return async (req: Request) => {
		try {
			const token = await verifyAccessTokenRequest(
				requestToResourceInput(req),
				verifyOptions,
			);
			// Awaited so a handler-thrown FORBIDDEN rejects inside this try and
			// gets turned into an insufficient_scope challenge below.
			return await handler(req, token);
		} catch (error) {
			try {
				raiseResourceServerChallenge(
					error,
					verifyOptions.verifyOptions.audience,
					{
						...opts,
						scope: opts?.scope ?? verifyOptions.scopes?.join(" "),
						dpopSigningAlgorithms: verifyOptions.dpop?.signingAlgorithms,
					},
				);
			} catch (err) {
				if (err instanceof APIError) {
					const headers = new Headers(err.headers as HeadersInit);
					headers.set("Content-Type", "application/json");
					return new Response(
						JSON.stringify({
							jsonrpc: "2.0",
							error: { code: -32000, message: err.message },
							id: null,
						}),
						{ status: err.statusCode, headers },
					);
				}
				throw new Error(String(err));
			}
			throw new Error(String(error));
		}
	};
};
