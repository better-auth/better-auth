---
"better-auth": patch
---

With `secondaryStorage`, sessions listed by the multi-session plugin now have `createdAt` and `updatedAt` as dates, as single session lookups already did. Before, these two fields came back as strings.
