---
"better-auth": patch
"@better-auth/stripe": patch
---

Pass the endpoint context as the second argument to `beforeDeleteOrganization` and `afterDeleteOrganization` hooks in the organization plugin, matching the signature shown in the docs and the existing `databaseHooks` pattern. The Stripe plugin's `beforeDeleteOrganization` wrapper now forwards the context to user-supplied hooks instead of dropping it.
