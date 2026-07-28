import { raiseResourceServerChallenge } from "@better-auth/oauth-provider";
import { APIError } from "better-call";

/**
 * Answer a failed request with a JSON-RPC error carrying the RFC 6750 / RFC
 * 9728 `WWW-Authenticate` challenge for the resource.
 *
 * Only authorization failures become a response. Anything else — including
 * whatever the route handler threw — propagates unchanged, so handler errors
 * keep their type and stack for the framework's error handling.
 */
export function toChallengeResponse(
	error: unknown,
	resource: string | string[],
	opts?: Parameters<typeof raiseResourceServerChallenge>[2],
): Response {
	try {
		raiseResourceServerChallenge(error, resource, opts);
	} catch (challengeError) {
		// Errors it does not answer are rethrown as-is, so identity distinguishes
		// a challenge it built from the original travelling back out.
		if (challengeError === error || !(challengeError instanceof APIError)) {
			throw challengeError;
		}
		const headers = new Headers(challengeError.headers as HeadersInit);
		headers.set("Content-Type", "application/json");
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: challengeError.message },
				id: null,
			}),
			{ status: challengeError.statusCode, headers },
		);
	}
	throw error;
}
