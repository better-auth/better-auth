---
"@better-auth/ciba": minor
---

CIBA deployments can now approve requests only on their own page or app, with the new `approvalPage` option, so the provider's consent page can no longer approve a request and skip that path's checks.

Set `approvalPage` to a path or URL to send users there with the request as `ciba_request_id`, or to `false` to send no link, as when your own app shows the request. With either value, `/oauth2/authorize` no longer approves CIBA requests, and your server records each decision with `auth.api.completeCibaRequest`. `resultPage` is required only without `approvalPage`, and TypeScript rejects it alongside `approvalPage`. Without `approvalPage`, requests are approved through the provider's pages as before.

`CibaNotification.url` is now typed as optional, because it is absent with `approvalPage: false`. Code that passes `url` where a string is required needs a check for `undefined`, even though the default configuration always sets it.
