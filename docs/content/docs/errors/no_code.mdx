---
title: No code
description: The code was not found in the request.
---

## What is it?

This error occurs during the OAuth callback when the authorization code is missing from the request.
In the Authorization Code flow, the provider redirects back to your `/api/auth/callback` route with a
`code` parameter (and typically `state`). Without the `code`, Better Auth cannot exchange it for tokens,
so the request is rejected.

## Common Causes

* The OAuth flow was not started correctly (wrong response type or custom URL missing required params).
* The provider returned an error instead of a code (e.g., user canceled consent), so only `error`/`error_description` are present.
* Query parameters were stripped by a reverse proxy, CDN, or framework rewrite.
* Callback URL mismatch at the provider caused an intermediate redirect that dropped query parameters.
* Mobile/WebView or deep-link handoff opened a new context that lost the query string.
* Using a response mode your handler does not read (e.g., form_post body vs query parameters).

## How to resolve

### Use the standard Authorization Code flow

* Start the flow through Better Auth so the provider receives the correct parameters and the app expects a `code`.
* In the provider settings, ensure your app is configured for Authorization Code (with PKCE where applicable).

### Verify callback URL and parameter delivery

* Confirm the provider's configured redirect URI exactly matches your `/api/auth/callback` route (protocol, host, path).
* Ensure infrastructure (proxies, rewrites, middleware) preserves the full query string and does not redirect in ways that drop parameters.

## Debug locally

* In DevTools → Network, inspect the callback request and verify whether `code` or `error` parameters are present.
* Log the raw query/body received by the callback handler during development to see exactly what arrived.
* Compare dev/staging/prod credentials and redirect URIs to ensure they are consistent across environments.
