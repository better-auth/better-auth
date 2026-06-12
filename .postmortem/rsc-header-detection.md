# Postmortem: Detecting RSC Context via Request Headers in Next.js

## Issue Reference

* [PR #7625](https://github.com/better-auth/better-auth/pull/7625) - first header-based detection
* [PR #7763](https://github.com/better-auth/better-auth/pull/7763) - replaced it with a cookie probe
* [PR #9059](https://github.com/better-auth/better-auth/pull/9059) - reverted to header-based detection
* [PR #9851](https://github.com/better-auth/better-auth/pull/9851) - tried to forward the header from a proxy

## Summary

You cannot detect an RSC request by reading the `RSC` header in Next.js.
The browser sends `RSC: 1` on a soft navigation, but Next.js classifies
`rsc`, `next-router-state-tree`, `next-router-prefetch`, etc. as internal
Flight headers and strips them from every user-accessible surface before
user code runs. Both a Server Component's `headers()` and a proxy's
`request.headers` see `null`. Any RSC detection built on reading these
headers is dead on arrival, and contributors keep reintroducing it.

## Recurrence History

This logic has cycled through four PRs, each trading one real problem
for another:

1. **#7625** introduced header-based detection (`RSC: 1`).
2. **#7763** found the header inaccessible and switched to a cookie
   probe: `cookies().set()` then `delete()` to test writability.
3. **#9059** reverted to header-based detection because the probe's
   `cookies().set()` unconditionally invalidates the router cache,
   causing infinite refresh loops (#8464) and a leaked probe cookie
   (#8828). It assumed `RSC: 1` is present on client-side flight
   requests. On Next.js 16 it is not.
4. **#9851** (external contributor) assumed the header is only stripped
   when a proxy/middleware is present, and tried to forward it into a
   custom `x-better-auth-is-rsc` header. The proxy never sees it either.

## Root Cause

### Next.js strips Flight headers on every surface

`FLIGHT_HEADERS` is deleted in two independent places, both before user
code runs (pinned to Next.js `v16.3.0-canary.36`, SHA `58e8c0b`):

* Proxy path, before building `NextRequestHint`:
  [`server/web/adapter.ts`](https://github.com/vercel/next.js/blob/58e8c0b4457f8f7cb737158efc543f3708f3e6e3/packages/next/src/server/web/adapter.ts#L164-L172)
* `headers()` path, in `getHeaders()`:
  [`server/async-storage/request-store.ts`](https://github.com/vercel/next.js/blob/58e8c0b4457f8f7cb737158efc543f3708f3e6e3/packages/next/src/server/async-storage/request-store.ts#L29-L36)

Next.js does this on purpose, so an RSC request is never handled
differently from its HTML counterpart. The behavior is documented under
[RSC requests and rewrites](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#rsc-requests-and-rewrites).

```ts
// WRONG - always null in RSC, with or without a proxy
const isRSC = (await headers()).get("RSC") === "1"

// ALSO WRONG - the proxy strips it too, nothing to forward
requestHeaders.set("x-better-auth-is-rsc", request.headers.get("RSC"))
```

### Why both fixes fail differently

* **Cookie probe (#7763)**: works as a signal, but `cookies().set()`
  invalidates the router cache on every call. Unacceptable side effect.
* **Header read (#7625, #9059)**: zero side effects, but the header is
  never there. Silent no-op.

### Why the tests pass anyway

The regression tests in `next-js.test.ts` mock `next/headers`:

```ts
headers: vi.fn(async () => new Headers({ RSC: "1" }))
```

`new Headers({ RSC: "1" })` is an input the real Next.js runtime never
produces, because it strips the header first. A mock returns whatever
the test feeds it, so the suite only proves the code agrees with the
mock, never that the mock matches the runtime. It is the inherent limit
of mocking a boundary: you stub the boundary's output instead of exercising
the rule that produces it.

## How to Verify

Run a real Next.js app, not a unit test. A Server Component that dumps
`(await headers()).get("RSC")` on a soft navigation prints `null`, even
though DevTools shows `RSC: 1` on the `?_rsc=...` request. A `proxy.ts`
logging `request.headers.get("RSC")` also prints `null`.

## Lesson Learned

1. **Internal Flight headers are not user-accessible.** Reading `RSC`
   from `headers()` or `request.headers` always returns `null`.
2. **A mock cannot validate an assumption about the real module.** The
   tests stubbed `headers()` to return a value the runtime never emits,
   so a green suite only proved the code agreed with the mock. Mocking a
   boundary stubs its output, it does not exercise the rule that strips
   the header. Behavior that depends on that rule belongs in a real-app
   or e2e check.
3. **Both directions are dead ends.** Header read is a no-op, proxy
   forward is a no-op, cookie probe has unacceptable side effects.
4. **Detection is the wrong goal.** It existed only to skip session
   refresh when cookies cannot be written. Make refresh idempotent so it
   is harmless in that case, instead of detecting the context.
5. **This is a recurring contributor assumption.** Link this document
   in review when a PR reads the `RSC` header.

## Prevention

1. Add a code comment at the detection site pointing to this postmortem.
2. Reject PRs that read `RSC` / `next-router-*` from `headers()` or a
   proxy. Link the two Next.js source lines above.
