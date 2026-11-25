---
"better-auth": patch
---

`update.after` database hooks no longer run when an update matches no record. Before, they ran with `null`, although their type promises the updated record, so hooks that read a field, such as the Stripe plugin's user hook, could throw.
