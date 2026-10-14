---
"better-auth": patch
"@better-auth/core": patch
---

Fix missing device sessions and failed automatic session switching after cache eviction when `storeSessionInDatabase` is enabled and `preserveSessionInDatabase` is disabled. Automatic switching now follows the order of held sessions, and large lists or sessions whose users no longer exist no longer cause valid sessions to disappear.
