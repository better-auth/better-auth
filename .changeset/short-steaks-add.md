---
"@better-auth/core": patch
---

Surface a clear error when an adapter's `deleteMany` returns a non-numeric value in the `consumeOne` fallback, instead of silently failing the consume.
