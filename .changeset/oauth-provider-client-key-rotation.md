---
"@better-auth/oauth-provider": patch
---

Confidential `private_key_jwt` clients that register inline `jwks` can now replace their own signing keys without a user session. Until now those keys were fixed at registration. The feature is off by default; set `allowClientKeyRotation: true` to enable it. No database migration is needed.

The client calls `POST /oauth2/client/rotate-keys` with its complete new `jwks` and a client assertion signed by one of its current keys, with `aud` set to the rotation endpoint's URL. An assertion addressed to the token endpoint or the issuer is rejected. Keys left out of the new set stop working at once, so roll a key in two steps: send the old and new keys together, then drop the old key once every instance signs with the new one.
