---
"@better-auth/cimd": minor
"@better-auth/oauth-provider": minor
---

Add `@better-auth/cimd` plugin for [Client ID Metadata Document draft-00](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00) support, and expose a typed `clientDiscovery` extension point on `oauthProvider()` so plugins can resolve `client_id` values from external sources.

### `@better-auth/cimd` (new package)

Install alongside `oauthProvider()` to let clients identify themselves by hosting an HTTPS metadata document; the URL becomes the `client_id`. This is the mechanism [MCP](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration#client-id-metadata-documents) uses for unauthenticated dynamic client discovery.

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

Ships with §3/§4.1 validation through the OAuth provider's shared client-metadata schema, SSRF protection that rejects private, reserved, link-local, unspecified, and cloud-metadata hosts (including IPv4-mapped IPv6 and 6to4/NAT64/Teredo tunnel forms), a 5-second fetch timeout, a 5 KB response size limit (UTF-8 byte-counted), configurable origin binding, and best-effort lifecycle notifications (`onClientCreated`, `onClientRefreshed`). Redirect URIs are not origin-bound by default because authorization still enforces exact matching and native clients commonly use loopback or private-use redirects. Advertises `client_id_metadata_document_supported` in OAuth/OIDC discovery metadata.

Loopback `client_id` URLs (`localhost`, `127.0.0.0/8`, `::1`, `*.localhost`), including plain HTTP, are fetched only when the new `allowLoopback` option is enabled, so a production server never fetches its own loopback interface. Loopback `redirect_uris` stay allowed for native and desktop flows.

The `allowFetch` pre-fetch gate lets operators add origin allowlists, per-host rate limits, or DNS-level defenses beyond the built-in IP-literal check.

Valid metadata documents are stored in a bounded plugin-owned LRU cache, configurable with `maxCacheEntries`. HTTP `Cache-Control`, `Expires`, `ETag`, and `Last-Modified` are honored, while `refreshRate` caps and supplies the fallback lifetime. `no-store` responses are not cached. Stale refreshes fail closed without replacing the previous database or cache state. `fetchMetadataDocument` can route HTTPS metadata requests through an in-process or runtime-specific fetch boundary.

Client creation and refresh now use the OAuth provider's canonical transactional registration operation. Server-default resource links are written atomically with the client, custom client/resource model names are honored, and admin-controlled fields (`disabled`, `skipConsent`, `enableEndSession`) survive refresh.

### `@better-auth/oauth-provider`: `clientDiscovery` extension field

```ts
import type { ClientDiscovery } from "@better-auth/oauth-provider";

oauthProvider({
  extensions: [
    {
      clientDiscovery: {
        id: "my-resolver",
        matches: (clientId) => clientId.startsWith("custom://"),
        resolve: async (ctx, clientId, existing) => {
          // create, refresh, or return null to pass through
        },
        discoveryMetadata: { custom_flow_supported: true },
      },
    },
  ],
});
```

`clientDiscovery` accepts a single `ClientDiscovery` or an array. `getClient()` walks the entries in order after the database lookup; the first entry whose `matches()` returns `true` and whose `resolve()` returns a non-null client wins. Each entry can also contribute `discoveryMetadata` fields that are merged into `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` responses.

Plugins like `@better-auth/cimd` contribute an entry through the extension surface at init time, so multiple discoveries can coexist.

Better Auth packages that implement verified discovery use a deliberate `@better-auth/oauth-provider/internal` persistence subpath instead of writing OAuth client rows directly.

`jwks_uri` validation now accepts a same-origin URL when the `client_id` itself is an HTTPS URL, since URL-based discovery flows verify the origin through the `client_id` itself.

Documentation now recommends removing the oauth-provider configuration `allowUnauthenticatedClientRegistration` when using CIMD.
