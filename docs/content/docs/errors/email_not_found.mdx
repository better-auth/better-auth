---
title: Email not found
description: The provider did not return an email address.
---

## What is it?

This error occurs during the OAuth flow when the provider does not return an email address for the user. 
Better Auth uses the email from the provider to identify or create a user account. If the provider omits 
the email (or returns it as empty/undefined), we cannot proceed and the request is rejected.

This error is only possible through OAuth providers. It will not occur in non-OAuth flows.

## Common Causes

* Missing or insufficient scopes in the provider configuration (e.g., not requesting `email`).
* The user's email is private or not exposed by default (e.g., GitHub private email).
* The provider returns email only via a separate endpoint and the scope/API call to fetch it was not enabled 
  (e.g., GitHub `user:email`).
* Provider project or tenant misconfiguration (consent screen, admin consent, restricted claims/attributes).
* Using different credentials between environments (preview/staging/prod) that do not request the same scopes.

## How to resolve

### Request the correct scopes

* Ensure your provider configuration requests the email-related scopes.

### Verify provider app/dashboard settings

* In the provider's dashboard, confirm the app has permission to request email and the consent screen allows it.

### Debug locally

* Inspect the outgoing authorize request to confirm the scopes include `email` where required.
* Inspect the callback payload (query, `id_token` claims, userinfo response) to see if an email claim exists.
* Log the provider profile object received by your callback handler to verify whether `email` is present.
* Check which environment's provider credentials are in use and whether scopes differ across environments.