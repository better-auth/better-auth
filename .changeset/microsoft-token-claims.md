---
"@better-auth/core": minor
---

Microsoft profile callbacks now accept numeric token timestamps, claim arrays, boolean corporate-network flags, and omitted conditional or opaque claims and profile photos. Profile mappings must handle these corrected values instead of treating timestamps as `Date` objects or all claims as present.
