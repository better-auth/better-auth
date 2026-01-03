---
title: Account already linked to different user
description: The account is already linked to a different user.
---

## What is it?

This error occurs during the OAuth flow when attempting to link an OAuth provider account 
to the currently authenticated user, but that exact provider account is already linked to 
another user in your project. To prevent account takeover, Better Auth blocks the link and 
throws this error.

This situation is only possible through the OAuth flow (e.g., Google, GitHub, etc.). It is 
not triggered by email/password flows on their own.

## How to resolve

### Typical resolutions

* Log in as the user who already has the provider linked, unlink the provider from that account, 
  then link it to the intended account.
* If both accounts belong to the same person and you want a single user, merge the accounts: choose 
  a primary user, move sessions and linked accounts from the secondary user to the primary, then 
  deactivate or delete the secondary.

### Common Causes

* You previously signed in or signed up using this provider on a different user in the same project.
* You have two local users (e.g., created via email/password or magic link) and you linked the provider 
  to one of them; now you are trying to link the same provider to the other.
* Test/preview environments share the same OAuth provider configuration and database; the provider account 
  is already linked to a different user record.
* Data migration or manual database edits left a stale link pointing to the wrong user.
* You rely on email matching to decide linking, but the actual unique key is the provider account identifier 
  (e.g., `providerId` + `accountId`). If that mapping exists for another user, linking will be blocked.

### Safer patterns and prevention

* Avoid automatically linking a provider to whichever user is currently signed in unless you explicitly 
  confirm ownership with the user.
* If you provide a 'Connect account' UI, clearly communicate which user will receive the link and what to do 
  if the provider is already linked elsewhere.
* Consider disabling linking for providers you only want to use for sign-in, to avoid accidental cross-linking.

### Debug locally

* Inspect your `account` database table. You should see rows keyed by 
  `providerId` (e.g., 'google') and `accountId` (e.g., OIDC `sub`), pointing to a `userId`.
* Identify which user currently owns the provider link and decide whether to unlink, merge, or keep as-is.
* Verify your app is connected to the expected database and environment (dev/staging/prod) to avoid confusion 
  due to shared credentials or misconfigured environment variables.

### Provider considerations

* Ensure you request stable user identifiers from the provider (e.g., OIDC `openid` scope) so `accountId` 
  remains consistent across sessions.
* If you changed provider projects/tenants, identifiers may differ; confirm you are linking the correct provider 
  credentials for the environment.

<Callout type="info">
  This error is a security safeguard. It prevents an OAuth identity that already belongs to one user 
  from being attached to another user without explicit action. If a legitimate merge is intended, perform 
  a controlled merge or unlink-then-link flow rather than bypassing the check.
</Callout>
