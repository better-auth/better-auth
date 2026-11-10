---
"better-auth": patch
---

Run the `beforeRemoveMember` and `afterRemoveMember` organization hooks when a member leaves an organization, so hook-based side effects such as Stripe seat synchronization also apply to members who leave on their own.
