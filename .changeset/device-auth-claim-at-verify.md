---
"better-auth": patch
---

fix(device-authorization): require verify-time ownership claim for approve/deny

Pending device codes were not bound to the user who entered the code on the verification page until approval, leaving a window where any authenticated user could approve or deny another user's pending code by knowing the `user_code`. `GET /device` now claims the pending row for the calling session, and `POST /device/approve` and `POST /device/deny` require the calling session to match the claimed owner. Custom verification pages must be served to an authenticated session for the flow to succeed.
