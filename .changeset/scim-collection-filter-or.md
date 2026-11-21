---
"@better-auth/scim": patch
---

SCIM collection filters now accept a uniform `or` of the existing equality attributes, so directory matching queries such as `userName eq "…" or emails.value eq "…"` no longer fail with `invalidFilter`. Mixed `and`/`or`, parentheses, `not`, presence, and comparison operators still return `invalidFilter`.
