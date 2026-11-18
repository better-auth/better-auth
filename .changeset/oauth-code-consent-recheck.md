---
"@better-auth/oauth-provider": minor
---

Redeeming an authorization code now needs a stored consent that still covers the code's scopes, resources, and UserInfo claims. Before, a code stayed valid for its lifetime after the user deleted or narrowed the consent it was issued under. A redemption after that fails with `invalid_grant`. A consent given again for the same client, consent reference, and access makes the code valid again. Codes of a client with `skip_consent` are not checked.
