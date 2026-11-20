---
"@better-auth/oauth-provider": minor
---

Redeeming an approved device code now needs a stored consent that still covers the scopes and resources the user approved. Before, a device approved before the user deleted or narrowed that consent could still get tokens until the code expired; it now gets `invalid_grant`. If the user approves the same access again for the client and consent reference, the code is valid again. Device codes of a client with `skip_consent` are not checked.
