import { encodeBasicCredentials } from "@better-auth/core/oauth2";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import {
	ACCESS_TOKEN_TYPE,
	TOKEN_EXCHANGE_GRANT_TYPE,
} from "@better-auth/oauth-provider";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { NextResponse } from "next/server";
import * as z from "zod";
import {
	getTokenExchangeDemoAPIURL,
	isTokenExchangeDemoEnabled,
} from "@/lib/token-exchange-demo";

const baseUrl = process.env.BETTER_AUTH_URL || "https://demo.better-auth.com";
const resource = `${baseUrl}/api/mcp`;

function extractPresentedAccessToken(request: Request): string {
	const authorization = request.headers.get("authorization");
	const accessToken = /^(?:Bearer|DPoP)[ \t]+(\S+)$/i.exec(
		authorization ?? "",
	)?.[1];
	if (!accessToken) {
		throw new TypeError(
			"verified MCP request is missing a valid Bearer or DPoP access token",
		);
	}
	return accessToken;
}

function toolError(text: string) {
	return { isError: true, content: [{ type: "text" as const, text }] };
}

/**
 * RFC 8693 exchange of the presented MCP token for a downstream API token,
 * then a call to that API. The exchanged token never leaves this function.
 */
async function callDownstreamAPI(subjectToken: string) {
	const clientId = process.env.TOKEN_EXCHANGE_DEMO_CLIENT_ID;
	const clientSecret = process.env.TOKEN_EXCHANGE_DEMO_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		return toolError(
			"TOKEN_EXCHANGE_DEMO_CLIENT_ID and TOKEN_EXCHANGE_DEMO_CLIENT_SECRET are not set. Run `node --experimental-strip-types scripts/token-exchange-demo-setup.ts` and export its output.",
		);
	}
	const apiURL = getTokenExchangeDemoAPIURL();
	const exchangeResponse = await fetch(`${baseUrl}/api/auth/oauth2/token`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
			Authorization: encodeBasicCredentials(clientId, clientSecret),
		},
		body: new URLSearchParams({
			grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
			subject_token: subjectToken,
			subject_token_type: ACCESS_TOKEN_TYPE,
			resource: apiURL,
		}),
	});
	const exchange: Record<string, unknown> = await exchangeResponse
		.json()
		.catch(() => ({}));
	if (exchangeResponse.status !== 200) {
		return toolError(
			`Token exchange failed (${exchangeResponse.status}): ${String(
				exchange.error ?? "unknown_error",
			)}${exchange.error_description ? ` - ${String(exchange.error_description)}` : ""}`,
		);
	}
	if (typeof exchange.access_token !== "string") {
		return toolError("Token exchange response has no access_token");
	}
	// The API URL is also the resource identifier, so it is used as given.
	const downstreamResponse = await fetch(`${apiURL.replace(/\/$/, "")}/me`, {
		headers: { Authorization: `Bearer ${exchange.access_token}` },
	});
	const downstream: unknown = await downstreamResponse.json().catch(() => null);
	if (!downstreamResponse.ok) {
		return toolError(
			`Downstream API returned ${downstreamResponse.status}: ${JSON.stringify(downstream)}`,
		);
	}
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({
					exchange: {
						issued_token_type: exchange.issued_token_type,
						token_type: exchange.token_type,
						scope: exchange.scope,
						expires_in: exchange.expires_in,
					},
					downstream,
				}),
			},
		],
	};
}

function readStringClaim(
	accessTokenClaims: unknown,
	claimName: string,
): string | undefined {
	if (typeof accessTokenClaims !== "object" || accessTokenClaims === null) {
		return undefined;
	}
	const claim = Reflect.get(accessTokenClaims, claimName);
	return typeof claim === "string" ? claim : undefined;
}

function requireStringAccessTokenClaim(
	accessTokenClaims: unknown,
	claimName: string,
): string {
	const claim = readStringClaim(accessTokenClaims, claimName);
	if (!claim) {
		throw new TypeError(`MCP access token is missing its ${claimName} claim`);
	}
	return claim;
}

const mcpServerHandler = createMcpHandler(
	(context) => {
		const accessTokenClaims = context.authInfo?.extra?.accessTokenClaims;
		const userId = readStringClaim(accessTokenClaims, "sub");
		const organization = readStringClaim(accessTokenClaims, `${baseUrl}/org`);
		const server = new McpServer({
			name: "demo-better-auth",
			version: "1.0.0",
		});
		server.registerTool(
			"echo",
			{
				description: "Echo a message",
				inputSchema: z.object({
					message: z.string(),
				}),
			},
			async ({ message }) => ({
				content: [
					{
						type: "text",
						text: `Echo: ${message}${userId ? ` for user ${userId}` : ""}${
							organization ? ` for organization ${organization}` : ""
						}`,
					},
				],
			}),
		);
		const subjectToken = context.authInfo?.token;
		if (isTokenExchangeDemoEnabled() && subjectToken) {
			server.registerTool(
				"call_downstream_api",
				{
					description:
						"Exchange this session's token for a downstream API token (RFC 8693) and call the API as the signed-in user",
				},
				() => callDownstreamAPI(subjectToken),
			);
		}
		return server;
	},
	{ legacy: "reject" },
);

const protectedMcpRequest = createMcpProtectedRequestHandler(
	{
		issuer: baseUrl,
		audience: resource,
		jwksUrl: `${baseUrl}/api/auth/jwks`,
	},
	(request, accessTokenClaims) => {
		const authInfo: AuthInfo = {
			token: extractPresentedAccessToken(request),
			clientId: requireStringAccessTokenClaim(accessTokenClaims, "client_id"),
			scopes:
				typeof accessTokenClaims.scope === "string"
					? [...new Set(accessTokenClaims.scope.split(" ").filter(Boolean))]
					: [],
			expiresAt: accessTokenClaims.exp,
			resource: new URL(resource),
			extra: { accessTokenClaims },
		};
		return mcpServerHandler.fetch(request, { authInfo });
	},
);

function addCorsHeaders(headers: Headers) {
	if (process.env.NODE_ENV === "development") {
		headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
		headers.set("Access-Control-Allow-Origin", "*");
		headers.set(
			"Access-Control-Allow-Headers",
			"authorization, content-type, mcp-protocol-version",
		);
	}
}

function withCors(
	handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
	return async (request) => {
		const response = await handler(request);
		addCorsHeaders(response.headers);
		return response;
	};
}

export const POST = withCors(protectedMcpRequest);

export async function OPTIONS(): Promise<NextResponse> {
	const headers = new Headers();
	addCorsHeaders(headers);
	return new NextResponse(null, {
		headers,
	});
}
