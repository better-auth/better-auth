---
"@better-auth/oauth-provider": minor
---

Redeeming an approved device code now needs a stored consent that still covers the scopes and resources the user approved. Before, a device approved before the user deleted or narrowed that consent could still get tokens until the code expired; it now gets `invalid_grant`. A consent given again for the same request leaves the code valid, and device codes of a client with `skip_consent` are not checked.

Every device approval replaces the stored consent for that client and reference. If the user approves a second device of the same client with fewer scopes before the first device redeems its code, the first device's poll now fails with `invalid_grant`.
