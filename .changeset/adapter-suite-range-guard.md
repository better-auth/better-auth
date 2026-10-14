---
"@better-auth/test-utils": patch
---

Adapter authors: `normalTestSuite` now checks that `update` returns the updated row when its `where` clause has a range condition on a field it changes, such as setting `expiresAt` while matching `expiresAt > now`. Session refresh in `better-auth` relies on this when `secondaryStorage` and `session.storeSessionInDatabase` are both enabled. An adapter that fails it signs users out on every refresh in that setup.
