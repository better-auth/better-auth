---
"better-auth": patch
---

The delete-account confirmation token is now consumed before the account is deleted, so concurrent callbacks carrying the same token can no longer run the deletion more than once.
