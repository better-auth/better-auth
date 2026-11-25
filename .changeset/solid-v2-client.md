---
"better-auth": minor
---

Added a Solid 2 client at `better-auth/solid-v2`. `useSession()` and plugin query hooks such as `useActiveOrganization()` return async accessors that work with Solid 2's `<Loading>`, `<Errored>` and `isPending`: the first load suspends, a request that fails before the first answer reaches `<Errored>` (later failures keep the last answer), a signed-out user reads `null`, and `refetch()` reports as pending. During server rendering, hooks answer with an optional value you pass in (such as the request's session) or `null`. `better-auth/solid` is unchanged for Solid 1 apps.
