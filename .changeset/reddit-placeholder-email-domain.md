---
"@better-auth/core": patch
---

A Reddit user with no email now receives a non-routable placeholder address (`<id>@reddit.invalid`) instead of one on the real `reddit.com` domain, so it cannot match a deliverable mailbox. The address stays unverified, and `mapProfileToUser` can supply a real email.
