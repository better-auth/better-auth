---
"@better-auth/ciba": minor
---

CIBA requests now accept `acr_values` and RFC 9396 `authorization_details`, which `/oauth2/bc-authorize` used to ignore.

Requested ACR values reach `authenticationContext.resolve` as `requestedAcrValues` when the user approves from the link, and `sendNotification` receives them as `acrValues`. To accept authorization details, list each type in the new `authorizationDetailsTypes` option with a `validate` function. The user sees the details in `sendNotification` and on the consent page, `completeCibaRequest` can narrow them with `authorizationDetails`, and the granted details are returned in the token response and the JWT access token. A detail with `locations` goes only to a token for one of those resources, and a detail without `locations` goes to every token. A request with authorization details must name a `resource` and is issued no refresh token. Without `authorizationDetailsTypes`, a request that carries `authorization_details` now fails with `invalid_authorization_details` instead of being approved without them.

The `cibaRequest` model has two new columns, `acrValues` and `authorizationDetails`. Run `npx auth@latest migrate`, or `npx auth@latest generate` and apply the schema with your ORM, before you upgrade.
