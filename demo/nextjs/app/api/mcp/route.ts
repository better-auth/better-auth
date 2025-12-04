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
						return {
							content: [
								{
									type: "text",
									text: `Echo: ${message}${
										jwt?.sub ? ` for user ${jwt?.sub}` : ""
									}`,
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

// import { createMcpHandler } from "mcp-handler";
// import { z } from "zod";
// import { NextRequest, NextResponse } from "next/server";
// import { JWTPayload } from "better-auth";
// import { withMcpAuth } from "mcp-handler";
// import { serverClient } from "@/lib/server-client";
// import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// /**
//  * Example derived from https://www.npmjs.com/package/mcp-handler
//  */
// const handler = createMcpHandler(
//   (server) => {
//     server.registerTool(
//       "echo", {
//         description: "Echo a message",
//         inputSchema: {
//           message: z.string(),
//         },
//       },
//       async ({ message }, extra) => {
//         const jwt = extra.authInfo?.extra?.jwt as JWTPayload | undefined
//         return {
//           content: [
//             {
//               type: "text",
//               text: `Echo: ${message}${
//                 jwt?.sub
//                   ? ` for user ${jwt.sub}`
//                   : ""
//               }`,
//             },
//           ],
//         };
//       }
//     );
//   }, {
//     serverInfo: {
//       name: "demo-better-auth",
//       version: "1.0.0",
//     }
//   }, {
//     basePath: "/api",
//     maxDuration: 60,
//     verboseLogs: true,
//   }
// );

// // Wrap your handler with authorization
// const verifyToken = async (
//   _req: Request,
//   bearerToken?: string
// ): Promise<AuthInfo | undefined> => {
//   if (!bearerToken) return undefined;
//   const baseUrl = process.env.BETTER_AUTH_URL || "https://demo.better-auth.com"
//   const jwtPayload = await serverClient.verifyAccessToken(bearerToken, {
//     jwksUrl: baseUrl + "/api/auth/jwks",
//     verifyOptions: {
//       audience: baseUrl + "/api/mcp",
//       issuer: baseUrl,
//     },
//   });
//   return {
//     token: bearerToken,
//     clientId: jwtPayload?.client_id as string,
//     scopes: (jwtPayload?.scope as string | undefined)?.split(" ") ?? [],
//     expiresAt: jwtPayload?.exp,
//     resource: jwtPayload?.aud
//       ? new URL(jwtPayload.aud.toString())
//       : undefined,
//     extra: {
//       jwt: jwtPayload,
//     },
//   };
// };

// const authHandler = withMcpAuth(handler, verifyToken, {
//   required: true, // Make auth required for all requests
//   // requiredScopes: ["read:stuff"], // Optional: Require specific scopes
// });

// function addCorsHeaders(headers: Headers) {
//   if (process.env.NODE_ENV === "development") {
// 		headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
// 		headers.set("Access-Control-Allow-Origin", "*");
// 		headers.set("Access-Control-Allow-Headers", "authorization, content-type, mcp-protocol-version");
// 	}
// }

// function withCors(handler: Function) {
// 	return async (req: Request) => {
// 		const res = await handler(req);
// 		addCorsHeaders(res.headers);
// 		return res;
// 	};
// }

// export const GET = withCors(authHandler);
// export const POST = withCors(authHandler);
// export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
//   const headers = new Headers();
//   addCorsHeaders(headers)
//   return new NextResponse(null, {
//     headers,
//   });
// }
