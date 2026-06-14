---
"better-auth": patch
---

Device authorization responses that carry credentials are now sent with `Cache-Control: no-store` and `Pragma: no-cache`, so intermediaries no longer cache them. This covers the device code response (`/device/code`) and the device token response (`/device/token`).
