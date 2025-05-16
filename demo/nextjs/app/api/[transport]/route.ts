import { createMcpHandler } from "@vercel/mcp-adapter";
import { withMcpAuth } from "better-auth/plugins";
import { z } from "zod";
import { auth } from "@/lib/auth";

const handler = withMcpAuth(auth, (req, session) => {
	return createMcpHandler(
		(server) => {
			server.tool(
				"echo",
				"Echo a message",
				{ message: z.string() },
				async ({ message }) => {
					return {
						content: [{ type: "text", text: `Tool echo: ${message}` }],
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

export { handler as GET, handler as POST, handler as DELETE };
