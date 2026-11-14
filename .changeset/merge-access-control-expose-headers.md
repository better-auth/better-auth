---
"better-auth": patch
---

An error thrown from an endpoint no longer drops the `Access-Control-Expose-Headers` names that a hook or the endpoint set earlier. The names from both are kept. Before, the error's value replaced the list, so a browser client on another origin could lose access to headers a hook had exposed.
