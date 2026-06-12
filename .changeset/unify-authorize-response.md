---
"better-auth": minor
---

`AuthorizeResponse` from `role().authorize()` is now `{ error: string | null }` instead of a discriminated union with `success`. A `null` error means authorized; a non-null error means denied. Replace `result.success` checks with `result.error === null` (or `result.error !== null` for failures).
