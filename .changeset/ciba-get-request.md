---
"@better-auth/ciba": minor
---

CIBA deployments can now read a pending request on their own approval page with the new server-only `auth.api.getCibaRequest({ body: { requestId, userId } })`. It returns what to show the user (client, scopes, resources, binding message, ACR values, authorization details, actor, and expiry), or `null` when `completeCibaRequest` would refuse the request as unknown, such as a decided or expired request or one for another user, and when the client no longer exists. `sendNotification` now also receives the requested `resources`.
