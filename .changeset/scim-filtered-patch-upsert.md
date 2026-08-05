---
"@better-auth/scim": minor
---

SCIM PATCH operations that target filtered multi-valued attributes (`phoneNumbers`, `addresses`, `roles`, `entitlements`, `emails`) now create the value when the filter matches nothing instead of rejecting the request with a `noTarget` error. Microsoft Entra ID sends these operations for attributes that are not populated yet, and the rejection also discarded every other operation bundled in the same PATCH request.
