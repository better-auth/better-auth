---
"better-auth": minor
---

The Gumroad OAuth helper now returns `undefined` for accounts without a name, matching its declared profile type. Profile mappings should handle a missing name.
