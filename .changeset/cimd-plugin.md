---
"@better-auth/cimd": minor
"@better-auth/oauth-provider": minor
---

Add `@better-auth/cimd` plugin for [Client ID Metadata Document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) support, and expose a typed `clientDiscovery` extension point on `oauthProvider()` so plugins can resolve `client_id` values from external sources.

### `@better-auth/cimd` (new package)

Install alongside `oauthProvider()` to let clients identify themselves by hosting an HTTPS metadata document; the URL becomes the `client_id`. This is the mechanism [MCP](https://modelcontextprotocol.io/specification/draft/basic/authorization#client-id-metadata-documents-flow) uses for unauthenticated dynamic client discovery.

```ts
import { oauthProvider } from "@better-auth/oauth-provider";
import { cimd } from "@better-auth/cimd";

betterAuth({
  plugins: [
    oauthProvider({ /* ... */ }),
    cimd({
      refreshRate: "60m",
      allowFetch: (url) => new URL(url).hostname.endsWith(".trusted.example"),
    }),
  ],
});
```

Ships with §3/§4.1 validation, SSRF protection for private/reserved IPs and cloud metadata endpoints, a 5-second fetch timeout, a 5 KB response size limit (UTF-8 byte-counted), origin binding for redirect URIs, and lifecycle hooks (`onClientCreated`, `onClientRefreshed`). Advertises `client_id_metadata_document_supported` in OAuth/OIDC discovery metadata.

The `allowFetch` pre-fetch gate lets operators add origin allowlists, per-host rate limits, or DNS-level defenses beyond the built-in IP-literal check.

Admin-controlled fields (`disabled`, `skipConsent`, `enableEndSession`) are preserved across refreshes so admin decisions survive document updates.

### `@better-auth/oauth-provider`: new `clientDiscovery` option

```ts
import type { ClientDiscovery } from "@better-auth/oauth-provider";

oauthProvider({
  clientDiscovery: [
    {
      id: "my-resolver",
      matches: (clientId) => clientId.startsWith("custom://"),
      resolve: async (ctx, clientId, existing) => {
        // create, refresh, or return null to pass through
      },
      discoveryMetadata: { custom_flow_supported: true },
    },
  ],
});
```

`clientDiscovery` accepts a single `ClientDiscovery` or an array. `getClient()` walks the entries in order after the database lookup; the first entry whose `matches()` returns `true` and whose `resolve()` returns a non-null client wins. Each entry can also contribute `discoveryMetadata` fields that are merged into `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` responses.

Plugins like `@better-auth/cimd` append an entry here at init time, so multiple discoveries can coexist.

The `checkOAuthClient` and `oauthToSchema` helpers are now exported for plugins that create client records directly.

`jwks_uri` validation now accepts a same-origin URL when the `client_id` itself is an HTTPS URL, since URL-based discovery flows verify the origin through the `client_id` itself.
