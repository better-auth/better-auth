---
"@better-auth/oauth-provider": patch
---

If you configure `clientPrivileges`, the callback now receives `clientId` when a user reads, updates, deletes, rotates the secret of, or configures scopes on an existing client. You can use it to allow or deny actions per client among users who share a `clientReference`. Before, the callback could not tell which client the request targeted. `clientId` is absent for creating and listing clients, and the callback still cannot grant access to a client owned by someone else. Existing callbacks keep working unchanged.
