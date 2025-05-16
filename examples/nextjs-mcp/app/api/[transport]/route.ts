import { auth } from "@/lib/auth";
import { createMcpHandler } from "@vercel/mcp-adapter";
import { withMcpAuth } from "better-auth/plugins";
import { z } from "zod";

const handler = withMcpAuth(
	auth,
	createMcpHandler(
		(server) => {
			server.tool(
				"echo",
				"Echo a message",
				{ message: z.string() },
				async ({ message }) => ({
					content: [{ type: "text", text: `Tool echo: ${message}` }],
				}),
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
	),
);

export { handler as GET, handler as POST, handler as DELETE };
