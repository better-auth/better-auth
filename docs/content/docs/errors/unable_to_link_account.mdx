---
title: Unable to link account
description: The account could not be linked.
---

## What is it?

This error occurs only during an OAuth flow when attempting to link the provider account to the
currently authenticated user. Better Auth blocks the operation if either:

1) The database operation to create/update the linked account fails.
2) The provider is not considered trusted for linking based on your auth configuration
   (`account.accountLinking.trustedProviders`).

## Common Causes

* The provider is not listed in `account.accountLinking.trustedProviders`.
* Configuration differs across environments (dev/staging/prod), so the provider appears untrusted in one environment.
* Database write failed due to unique constraint, foreign key violation, or transaction/connection issues.
* A race condition linking the same provider concurrently caused a conflict.
* Pending migrations or a mismatched schema between services caused the write to fail.

## How to resolve

### Allow linking for the intended provider

* Add the provider id (e.g., `github`, `google`) to `account.accountLinking.trustedProviders` in your auth config.
* Verify you are using the correct provider id/slug that your integration expects.

### Fix database reliability and constraints

* Run pending migrations and ensure the schema matches the current Better Auth version.
* Investigate DB errors (deadlocks, timeouts, connection pool limits) and retry if appropriate.

### Verify environment configuration

* Ensure the same auth config is deployed to all environments and that environment variables are loaded as expected.
* Double-check that the runtime sees the intended `trustedProviders` list.

