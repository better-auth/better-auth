---
title: State not found
description: The state parameter was not found in the request.
---

## What is it?

During the OAuth callback, Better Auth expects a `state` value to be present on the incoming request. 
This `state` is originally generated when the OAuth flow starts and is sent to the provider. When the 
provider redirects back to your app, it should include the same `state` value in the callback request.
If the `state` is missing entirely in the callback request (query or body), 
we cannot validate the flow and the request is rejected.

This check prevents CSRF and replay attacks by ensuring the callback belongs to the same browser session 
that initiated the flow.

## Common Causes

* You navigated directly to `/api/auth/callback` without starting an OAuth flow first.
* A reverse proxy, CDN, or rewrite stripped query or body parameters from the callback request.
* The OAuth provider was not given a `state` on the authorize request (custom/manual flow overriding parameters).
* The callback URL registered at the provider does not match your actual callback route, causing an intermediate 
  redirect that drops query or body parameters.
* The callback reached a different route/handler than expected due to framework routing or middleware, and the 
  handler is not reading the query or body you think it is.
* Mobile/WebView or deep-link handoff opened a new context that lost the original query string.

## How to resolve

### Start the flow via Better Auth APIs

Always initiate OAuth through Better Auth so we can generate and send `state` correctly. Avoid manually hitting 
callback endpoints or constructing authorize URLs unless you fully mirror Better Auth's parameters.

### Verify the callback URL and method

* Ensure the provider's configured callback URL exactly matches your app's `/api/auth/callback` route (including 
  protocol and domain).
* Most providers redirect via GET with query parameters. If you have custom handlers or methods, confirm the 
  handler reads the query/body consistent with your provider's redirect.

### Check proxies, rewrites, and middleware

* Confirm that any reverse proxies (Vercel, Cloudflare, Nginx) and app-level rewrites preserve the full query 
  string (including `state`).
* If you have middleware that redirects or rewrites the callback path, ensure it forwards query & body parameters intact.

### Debug locally

Use your browser DevTools → Network to inspect the callback request:

* Confirm the callback URL includes `?state=...` (or that the request body contains `state` if you expect one).
* Verify the authorize request was sent earlier from the same session and that a `state` cookie exists prior to 
  the redirect back.
* Log request query/body fields in your callback handler during local debugging to confirm what is actually 
  received by the server.

### Edge cases to consider

* Preview vs production domains can behave differently if extra redirects or rewrites occur.
* Mobile/WebView environments and deep links can drop or alter query parameters during handoff.
