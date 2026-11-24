---
"better-auth": patch
---

`@types/react` is now an optional peer dependency, so the `better-auth/react` types resolve under package layouts that don't hoist it, such as pnpm with `hoist: false` or its global virtual store, and Yarn PnP. Before, `tsc` reported TS7016 for `react` with `skipLibCheck: false`, and with `skipLibCheck: true` the `deps` option of `useStore` was typed as `any`.
