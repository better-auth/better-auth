import { createServer } from "node:http";
import type { VerifyAccessTokenRemote } from "@better-auth/oauth-provider/resource-client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { isAPIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { toNodeHandler } from "better-auth/node";
import { createAuth, readEnv, ready } from "./auth.ts";

/**
 * A separate API app that verifies the authorization server's tokens with
 * the resource client's defaults: it passes only its own `audience`, never
 * `issuer`, `jwksUrl`, or `introspectUrl`.
 */
const env = readEnv();
const serverClient = createAuthClient({
	plugins: [oauthProviderResourceClient(createAuth(env))],
});
const verifyOptions = { audience: env.resource };

async function route(request: Request): Promise<Response> {
	const { pathname } = new URL(request.url);
	const bearer = request.headers
		.get("authorization")
		?.replace(/^Bearer\s+/i, "");
	if (pathname === "/.well-known/oauth-protected-resource") {
		return Response.json(
			await serverClient.getProtectedResourceMetadata({
				resource: env.resource,
				scopes_supported: ["read:data"],
			}),
		);
	}
	if (pathname === "/bearer") {
		return Response.json(
			await serverClient.verifyBearerToken(bearer, { verifyOptions }),
		);
	}
	if (pathname === "/dpop") {
		return Response.json(
			await serverClient.verifyAccessTokenRequest(request, { verifyOptions }),
		);
	}
	if (pathname === "/introspect") {
		// Plain JavaScript callers may leave out `introspectUrl`; the default
		// is what this route exercises.
		const remoteVerify = {
			clientId: request.headers.get("x-client-id") ?? "",
			clientSecret: request.headers.get("x-client-secret") ?? "",
			force: true,
		} as VerifyAccessTokenRemote;
		return Response.json(
			await serverClient.verifyBearerToken(bearer, {
				verifyOptions,
				remoteVerify,
			}),
		);
	}
	return new Response("not found", { status: 404 });
}

async function handler(request: Request): Promise<Response> {
	try {
		return await route(request);
	} catch (error) {
		if (isAPIError(error)) {
			return Response.json(error.body ?? {}, {
				status: error.statusCode,
				headers: error.headers,
			});
		}
		const message = error instanceof Error ? error.message : String(error);
		return Response.json({ error: message }, { status: 401 });
	}
}

createServer(toNodeHandler(handler)).listen(env.port, () => ready());
