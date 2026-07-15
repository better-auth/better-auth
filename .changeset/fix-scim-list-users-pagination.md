---
"better-auth": patch
---

Fix SCIM `GET /scim/v2/Users` silently truncating at 100 results and reporting the wrong `totalResults`. Accept RFC 7644 `startIndex` and `count` query parameters for pagination.
