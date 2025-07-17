import { auth } from "@/lib/auth";
import { createMcpHandler } from "@vercel/mcp-adapter";
import { withMcpAuth } from "better-auth/plugins";
import { z } from "zod";

interface AuthenticatedRequest extends Request {
	context: {
		jwt: {
			// JWTPayload from 'jose' package
			sub?: string;
		};
	};
}

export const GET = withMcpAuth(auth, (req: Request) => {
	const sub = (req as AuthenticatedRequest).context.jwt.sub;
	return createMcpHandler(
		(server) => {
			server.tool(
				"echo",
				"Echo a message",
				{ message: z.string() },
				async ({ message }) => {
					return {
						content: [
							{
								type: "text",
								text: `Sub ${sub} says: ${message}`,
							},
						],
					};
				},
			);
		},
		{
			capabilities: {
				tools: {
					echo: {
						description: "Echo a message",
					},
				},
			},
		},
		{
			redisUrl: process.env.REDIS_URL,
			basePath: "/api",
			verboseLogs: true,
			maxDuration: 60,
		},
	)(req);
});
