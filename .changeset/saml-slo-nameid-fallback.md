---
"@better-auth/sso": patch
---

Fixes SAML Single Logout (`saml.enableSingleLogout`) for users who stay signed in past their session's first expiry, which with default settings is any user active for more than 7 days.

- IdP-initiated logout now ends the Better Auth session. Before, after that point, a LogoutRequest that arrived without the session cookie, such as one sent with the HTTP-POST binding or from an iframe, left the user signed in.
- SP-initiated logout now sends the NameID and SessionIndex from sign-in. Before, after that point, it sent the user's email as the NameID, which the IdP can't match when it issued a persistent or transient NameID.

Sessions whose logout data was already gone before upgrading send the NameID saved on the user's SAML account. Apps without Single Logout enabled are unaffected, and no action is needed.
