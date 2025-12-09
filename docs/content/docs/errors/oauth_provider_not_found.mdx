---
title: OAuth provider not found
description: The OAuth provider was not found.
---

## What is it?

This error occurs when Better Auth cannot identify a provider for the callback path—either because the provider
segment is missing or because no provider with that id is configured.

Better Auth expects the callback route to be shaped like `/api/auth/callback/<provider>`.
If the `<provider>` segment is absent (e.g., request hits `/api/auth/callback`),
we cannot determine which integration should handle the callback and the
request is rejected.

## Common Causes

* Visiting `/api/auth/callback` directly without the trailing provider segment.

## How to resolve

### Use the correct callback route shape

* Ensure your application exposes a callback route like `/api/auth/callback/[provider]` (framework-specific).
* When initiating the OAuth flow, ensure the redirect URI includes the provider segment so the provider
  returns to `/api/auth/callback/<provider>`.

### Configure infrastructure to preserve the path

* Check proxy/CDN rewrites (Vercel, Cloudflare, Nginx) to make sure they do not strip the final path segment.
* Align trailing slash behavior across environments so that `/api/auth/callback/<provider>` is preserved.

### Avoid manual access to the base callback route

* Do not navigate to `/api/auth/callback` directly; always start OAuth via Better Auth APIs which generate
  the correct provider-specific callback URL.

## Debug locally

* Inspect the request URL received by your server to confirm the `<provider>` segment is present.
* Log router/path parameters in your callback handler to verify the provider value.
* Compare environment configs (routes, basePath, rewrites) to ensure the same path structure is used everywhere.

## Edge cases to consider

* Trailing slash normalization may alter routing if your framework treats `/callback/google/` differently
  from `/callback/google`. Configure consistent behavior.