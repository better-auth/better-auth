---
"better-auth": patch
---

Deny permission checks that name a member inherited from `Object.prototype`. Resource names in `has-permission` requests are caller-supplied strings, so a value such as `constructor` or `valueOf` resolved to a function through the prototype chain instead of `undefined`, slipped past the unknown-resource guard, and threw a `TypeError` while evaluating actions. Such resources are now reported as unknown and fail closed.
