---
"@better-auth/core": minor
---

VK profile callbacks now accept phone numbers as strings, preserving their country prefix. Profile mappings must treat `user.phone` as a string instead of a number.
