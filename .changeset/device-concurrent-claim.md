---
"better-auth": patch
---

When the same signed-in user looked up an unclaimed device code twice at once, for example from an approval page that React Strict Mode renders twice in development, one `GET /device` response had no `client_id` or `scope`. The approval page then showed the code as invalid or claimed by another session. Both responses now include the request details.
