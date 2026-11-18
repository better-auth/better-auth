---
"@better-auth/oauth-provider": minor
---

Accepting the consent page now adds to the user's stored consent for the client instead of replacing it. Before, a later approval for fewer scopes, another resource, or other UserInfo claims dropped what the user had approved earlier. As a result, the consent page shows less often, `prompt=none` gets a code for access the user approved earlier, and `getOAuthConsents` lists everything the user approved. A scope or claim the user leaves out on the consent page is still removed, `updateOAuthConsent` still narrows a consent, and deleting a consent is how a user cuts a client off. Existing consents need no migration and grow from their next approval.
