---
"@better-auth/api-key": patch
---

User-owned API keys now stop working when their owner is banned through the admin plugin or has been deleted. `verifyApiKey` returns `USER_BANNED` or `INVALID_REFERENCE_ID_FROM_API_KEY`, and requests that use the key with `enableSessionForAPIKeys` are rejected instead of receiving a session. Previously a banned user could keep calling API-key protected endpoints, because banning only revoked the user's sessions. Keys work again once the ban is lifted or `banExpires` passes, and a rejected key does not use up its `remaining` count or rate limit. Organization-owned keys are unaffected.
