---
"@better-auth/scim": patch
---

SCIM User and Group requests now accept JSON `null` attribute values, such as the unpopulated attributes Microsoft Entra ID sends, instead of returning `400 Bad Request`. In `POST` and `PUT` bodies a `null` attribute is treated as omitted, and in PATCH a `null` value removes the attribute. `active: null` is still rejected, and `null` on a read-only attribute is ignored.
