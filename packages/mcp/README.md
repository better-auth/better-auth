# @better-auth/mcp

Model Context Protocol (MCP) plugin for [Better Auth](https://www.better-auth.com).

`mcp()` turns your Better Auth app into an OAuth 2.1 authorization server for MCP
clients, built on [`@better-auth/oauth-provider`](https://www.better-auth.com/docs/plugins/oauth-provider).
It serves the RFC 9728 protected resource metadata so MCP clients can discover it.
To protect an MCP route, wrap its handler with `requireMcpAuth` (or `mcpHandler`),
which verifies bearer tokens against the published JWKS.

```ts
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";

export const auth = betterAuth({
  plugins: [jwt(), mcp({ loginPage: "/login", consentPage: "/consent" })],
});
```

See the [MCP plugin documentation](https://www.better-auth.com/docs/plugins/mcp).
