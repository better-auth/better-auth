---
"@better-auth/oauth-provider": minor
---

Accepting the consent page now adds to the user's stored consent for the client and consent reference instead of replacing it. Before, a later approval for fewer scopes, another resource, or other UserInfo claims dropped what the user had approved earlier. As a result, the consent page shows less often, `prompt=none` gets a code for access the user approved earlier, and `getOAuthConsents` lists everything the user approved. Only a scope or claim that the consent page offered and the user declined is removed, and `updateOAuthConsent` still narrows a consent. Existing consents need no migration and grow from their next approval.
