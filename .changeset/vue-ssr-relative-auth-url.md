---
"better-auth": patch
---

Fix the Vue client's `useSession(useFetch)` returning no session during Nuxt SSR when `baseURL` is inferred from the environment.
