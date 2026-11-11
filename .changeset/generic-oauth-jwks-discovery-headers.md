---
"better-auth": patch
---

Generic OAuth providers configured with `discoveryHeaders` now send those headers when fetching the provider's signing keys from a `jwks_uri` on the same origin as `discoveryUrl`. Before, the keys request went out without them. Providers whose key endpoint requires the headers rejected it, so every ID token failed verification and sign-in failed. A `jwks_uri` on another origin still gets no headers.

With `discoveryHeaders` set, the discovery request now follows redirects only within the origin of `discoveryUrl`, so the headers no longer reach another host. If your `discoveryUrl` redirects to another origin, discovery now fails and Better Auth logs an error. Set `discoveryUrl` to the final URL. Providers without `discoveryHeaders` are unaffected.
