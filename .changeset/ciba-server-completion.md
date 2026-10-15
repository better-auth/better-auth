---
"@better-auth/ciba": minor
---

Let your own app collect a CIBA decision, such as a one-tap approval from a push notification, and record it with `auth.api.completeCibaRequest`. `sendNotification` now receives the `requestId` to pass back, together with the `userId` your app authenticated and the decision. The call refuses a decision for any user other than the one the client named, and approved scopes must stay within the request and include `openid`. You can also pass the `authTime`, `acr`, and `amr` your app established, and they are issued in the ID token. A ping client is called back as it is after a decision from the link.
