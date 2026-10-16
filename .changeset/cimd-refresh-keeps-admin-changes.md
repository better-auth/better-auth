---
"@better-auth/oauth-provider": patch
---

Apps using the CIMD plugin no longer lose an administrator's change to a discovered client when a metadata refresh is running at the same time. Before, disabling the client, setting `skipConsent` or `enableEndSession`, or assigning `client_credentials` scopes while its document was being fetched could be undone by the refresh. No action is needed.
