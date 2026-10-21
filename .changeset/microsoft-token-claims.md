---
"@better-auth/core": minor
---

**Breaking:** `MicrosoftEntraIDProfile` timestamps are numbers, `groups`, `acrs`, and `xms_cc` are string arrays, `in_corp` is boolean, and conditional claims and profile photos can be omitted. Update profile mappings to handle these types and missing values.
