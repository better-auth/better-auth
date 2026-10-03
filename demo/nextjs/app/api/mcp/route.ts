import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { NextResponse } from "next/server";
import * as z from "zod";

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
