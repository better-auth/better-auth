/**
 * Downstream API for the token exchange demo. It accepts only RFC 9068 JWT
 * access tokens issued by the demo AS for its own resource identifier.
 * `node --experimental-strip-types scripts/token-exchange-api.ts`
 */
import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";

function requireEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

const port = Number(requireEnv("PORT"));
const audience = requireEnv("TOKEN_EXCHANGE_DEMO_API_URL");
const issuer = requireEnv("TOKEN_EXCHANGE_DEMO_ISSUER");
const jwks = createRemoteJWKSet(new URL(`${issuer}/api/auth/jwks`));

function sendJSON(
	response: ServerResponse,
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
) {
	response.writeHead(status, {
		"Content-Type": "application/json",
		"Cache-Control": "no-store",
		...headers,
	});
	response.end(JSON.stringify(body));
}

function sendInvalidToken(response: ServerResponse, description: string) {
	sendJSON(
		response,
		401,
		{ error: "invalid_token", error_description: description },
		{ "WWW-Authenticate": 'Bearer error="invalid_token"' },
	);
}

const server = createServer(async (request, response) => {
	// URL.parse returns null instead of throwing on a malformed request target.
	const path = URL.parse(request.url ?? "/", "http://localhost")?.pathname;
	if (!path) {
		sendJSON(response, 400, { error: "invalid_request" });
		return;
	}
	if (request.method === "GET" && path === "/health") {
		sendJSON(response, 200, { ok: true });
		return;
	}
	if (request.method !== "GET" || path !== "/me") {
		sendJSON(response, 404, { error: "not_found" });
		return;
	}
	const token = /^Bearer[ \t]+(\S+)$/i.exec(
		request.headers.authorization ?? "",
	)?.[1];
	if (!token) {
		sendInvalidToken(response, "missing bearer access token");
		return;
	}
	try {
		const { payload } = await jwtVerify(token, jwks, {
			issuer,
			audience,
			typ: "at+jwt",
		});
		sendJSON(response, 200, {
			sub: payload.sub,
			aud: payload.aud,
			client_id: payload.client_id,
			azp: payload.azp,
			scope: payload.scope,
			exp: payload.exp,
			iat: payload.iat,
			sid: payload.sid,
			act: payload.act ?? null,
			// The consent reference the user approved (here, the organization).
			reference_id: payload.reference_id ?? null,
			// The demo's own claim, which lib/auth.ts customAccessTokenClaims derives
			// from that reference.
			org: payload[`${issuer}/org`] ?? null,
		});
	} catch (error) {
		sendInvalidToken(
			response,
			error instanceof Error ? error.message : "invalid access token",
		);
	}
});

server.listen(port, "127.0.0.1", () => {
	console.error(`token exchange demo API listening on 127.0.0.1:${port}`);
});
