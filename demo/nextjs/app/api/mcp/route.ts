import { mcpHandler } from "@better-auth/oauth-provider";
import { createMcpHandler } from "mcp-handler";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as z from "zod";

const baseUrl = process.env.BETTER_AUTH_URL || "https://demo.better-auth.com";

/**
 * Example derived from https://www.npmjs.com/package/mcp-handler
 */
const handler = mcpHandler(
	{
		jwksUrl: baseUrl + "/api/auth/jwks",
		verifyOptions: {
			audience: baseUrl + "/api/mcp",
			issuer: baseUrl,
		},
	},
	(req, jwt) => {
		return createMcpHandler(
			(server) => {
				server.registerTool(
					"echo",
					{
						description: "Echo a message",
						inputSchema: {
							message: z.string(),
						},
					},
					async ({ message }) => {
						const baseUrl =
							process.env.BETTER_AUTH_URL || "https://demo.better-auth.com";
						const org = jwt?.[baseUrl + "/org"];
						return {
							content: [
								{
									type: "text",
									text: `Echo: ${message}${
										jwt?.sub ? ` for user ${jwt?.sub}` : ""
									}${org ? ` for organization ${org}` : ""}`,
								},
							],
						};
					},
				);
			},
			{
				serverInfo: {
					name: "demo-better-auth",
					version: "1.0.0",
				},
			},
			{
				basePath: "/api",
				maxDuration: 60,
				verboseLogs: true,
			},
		)(req);
	},
);

function addCorsHeaders(headers: Headers) {
	if (process.env.NODE_ENV === "development") {
		headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		headers.set("Access-Control-Allow-Origin", "*");
		headers.set(
			"Access-Control-Allow-Headers",
			"authorization, content-type, mcp-protocol-version",
		);
	}
}

function withCors(handler: Function) {
	return async (req: Request) => {
		const res = await handler(req);
		addCorsHeaders(res.headers);
		return res;
	};
}

export const GET = withCors(handler);
export const POST = withCors(handler);
export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
	const headers = new Headers();
	addCorsHeaders(headers);
	return new NextResponse(null, {
		headers,
	});
}
