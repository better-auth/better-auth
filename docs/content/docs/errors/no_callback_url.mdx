---
title: No callback URL
description: The callback URL was not found in the request.
---

## What is it?

This error occurs during the OAuth flow when the request reaches your `/api/auth/callback` endpoint
but the `state` data does not contain a callback URL.
Better Auth stores metadata in `state` when the flow starts, including where to redirect after a
successful sign-in/link. If that URL is missing at callback time, we cannot safely continue.

## Common Causes

* The OAuth flow was not started via Better Auth APIs, so the `state` payload never included a callback URL.
* A reverse proxy, CDN, or middleware altered the flow, causing the app to read a different or empty `state`.

## How to resolve

### Start the flow through Better Auth

* Always initiate OAuth using Better Auth's built-in methods so `state` is generated with the needed fields.
