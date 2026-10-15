---
"@better-auth/core": minor
---

Microsoft profile callbacks now accept numeric token timestamps, claim arrays, and omitted conditional claims or profile photos. Profile mappings must handle these corrected values instead of treating timestamps as `Date` objects or all claims as present.
