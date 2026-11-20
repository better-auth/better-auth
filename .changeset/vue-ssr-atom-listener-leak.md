---
"better-auth": patch
---

Skip Vue `useStore` atom subscriptions during SSR so a module-level client does not accumulate listeners across requests.
