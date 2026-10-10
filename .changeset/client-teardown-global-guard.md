---
"better-auth": patch
---

Guard client teardown callbacks against missing window/document globals, fixing post-suite crashes in test environments that remove the DOM
