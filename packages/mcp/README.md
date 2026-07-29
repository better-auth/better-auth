# @better-auth/mcp

Model Context Protocol (MCP) plugin for [Better Auth](https://www.better-auth.com).

`mcp()` turns your Better Auth app into an OAuth 2.1 authorization server and
protected resource for MCP clients, built on
[`@better-auth/oauth-provider`](https://www.better-auth.com/docs/plugins/oauth-provider).
It serves RFC 9728 protected resource metadata and binds issued tokens to the
configured resource. Compose it with `cimd()` for the MCP 2026-07-28 Client ID
Metadata Document flow, which pins CIMD draft-00 through an explicit metadata
profile. Dynamic Client Registration is disabled unless explicitly enabled.

```ts
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { fetchClientMetadataResource } from "./oauth-network";

export const auth = betterAuth({
  plugins: [
    jwt(),
    mcp({
      loginPage: "/login",
      consentPage: "/consent",
      resource: "https://api.example.com/mcp",
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
});
```

See the [MCP plugin documentation](https://www.better-auth.com/docs/plugins/mcp).
