---
"@better-auth/ciba": minor
---

CIBA deployments can now approve requests only on their own page or app, with the new `approvalPage` option, so the provider's consent page can no longer approve a request and skip that path's checks.

Set `approvalPage` to a path or URL to send users there with the request as `ciba_request_id`, or to `false` to send no link, as when your own app shows the request. With either value, `/oauth2/authorize` no longer approves CIBA requests, and your server records each decision with `auth.api.completeCibaRequest`. `resultPage` is required only without `approvalPage`, and TypeScript rejects it alongside `approvalPage`. Without `approvalPage`, requests are approved through the provider's pages as before.

`CibaOptions` is now a type alias instead of an interface, so code that extends it with `interface` must use an intersection type instead.

`CibaNotification.url` is now optional: it is absent when `approvalPage: false`. A `sendNotification` that uses `url` as a string must check for `undefined` to typecheck, even though the default configuration always sets it.
