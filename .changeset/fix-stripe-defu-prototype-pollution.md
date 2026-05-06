---
"@better-auth/stripe": patch
---

fix(stripe): drop unsafe keys when merging user-supplied metadata

The Stripe plugin previously merged `ctx.body.metadata` through `defu`, which was vulnerable to prototype pollution when attacker-controlled `__proto__` keys reached the second argument. Since Stripe metadata is a flat `Record<string, string>`, the deep-merge was never exercised on that path. The merge now ignores `__proto__`, `constructor`, and `prototype`, so the user-controlled surface no longer depends on `defu`. The remaining `defu` call sites (deep-merging developer-supplied `CustomerCreateParams`) also receive the patched range.
