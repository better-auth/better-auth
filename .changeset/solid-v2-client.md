---
"better-auth": minor
---

Solid 2 apps can now use Better Auth through `better-auth/solid-v2`. `useSession()` and plugin query hooks return async accessors that work with `<Loading>`, `<Errored>` and `isPending`, and can render the request's session during server rendering. `better-auth/solid` is unchanged for Solid 1 apps, including SolidStart.