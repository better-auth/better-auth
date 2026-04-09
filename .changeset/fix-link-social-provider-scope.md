---
"better-auth": patch
---

fix(oauth2): prevent cross-provider account collision in link-social callback

The link-social callback used `findAccount(accountId)` which matched by account ID across all providers. When two providers return the same numeric ID (e.g. both Google and GitHub assign `99999`), the lookup could match the wrong provider's account, causing a spurious `account_already_linked_to_different_user` error or silently updating the wrong account's tokens.

Replaced with `findAccountByProviderId(accountId, providerId)` to scope the lookup to the correct provider, matching the pattern already used in the generic OAuth plugin.
