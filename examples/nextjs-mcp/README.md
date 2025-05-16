# Better Auth - MCP Demo

This is example repo on how to setup Better Auth for MCP Auth using Nextjs and Vercel MCP adapter.


## Usage

First, add the plugin to your auth instance

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";

export cosnt auth = betterAuth({
    plugins: [
        mcp({
            loginPage: "/sign-in" // path to a page where users login
        })
    ]
})
```

Make sure to `generate` or `migrate` required schema using the cli:
```bash
npx @better-auth/cli generate ## or (migrate)
```

Add a route to expose oauth metadata

```ts
// .well-known/oauth-authroization-server/route.ts
import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { auth } from "../../../lib/auth";

export const GET = oAuthDiscoveryMetadata(auth);
```

Mount the handlers if you haven't

```ts
// api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

Use `auth.api.getMCPSession` to get the session using the access token sent from the MCP client

```ts
import { auth } from "@/lib/auth";
import { createMcpHandler } from "@vercel/mcp-adapter";
import { withMcpAuth } from "better-auth/plugins";
import { z } from "zod";

const handler = withMcpAuth(auth, (req, sesssion) => {
    //session => This isn’t a typical Better Auth session - instead, it returns the access token record along with the scopes and user ID.
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
```

And that's it!!