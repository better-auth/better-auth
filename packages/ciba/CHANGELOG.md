# @better-auth/ciba

## 1.8.0-beta.11

### Minor Changes

- [#12712](https://github.com/better-auth/better-auth/pull/12712) [`a136236`](https://github.com/better-auth/better-auth/commit/a136236f0ac726473fe002df528547d8437dcbaa) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - CIBA deployments can now approve requests only on their own page or app, with the new `approvalPage` option, so the provider's consent page can no longer approve a request and skip that path's checks.

  Set `approvalPage` to a path or URL to send users there with the request as `ciba_request_id`, or to `false` to send no link, as when your own app shows the request. With either value, `/oauth2/authorize` no longer approves CIBA requests, and your server records each decision with `auth.api.completeCibaRequest`. `resultPage` is required only without `approvalPage`, and TypeScript rejects it alongside `approvalPage`. Without `approvalPage`, requests are approved through the provider's pages as before.

  `CibaOptions` is now a type alias instead of an interface, so code that extends it with `interface` must use an intersection type instead.

  `CibaNotification.url` is now optional: it is absent when `approvalPage: false`. A `sendNotification` that uses `url` as a string must check for `undefined` to typecheck, even though the default configuration always sets it.

- [#12801](https://github.com/better-auth/better-auth/pull/12801) [`128541d`](https://github.com/better-auth/better-auth/commit/128541d6a2c52692b5d8e1aa287d0f3a13119c2e) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A CIBA request the user approved from the link can no longer be redeemed after the user deletes or narrows the consent that approval stored. The client's poll gets `invalid_grant`. Because the link records one decision, only a consent given again through another request, for the same client, scopes, and reference, makes it redeemable. Requests approved with `completeCibaRequest` and requests of a client with `skip_consent` are not checked.

  The `cibaRequest` model has a new `approvedViaConsent` column. Run `npx auth@latest migrate`, or `npx auth@latest generate` and apply the schema with your ORM, before you upgrade.

- [#12712](https://github.com/better-auth/better-auth/pull/12712) [`a136236`](https://github.com/better-auth/better-auth/commit/a136236f0ac726473fe002df528547d8437dcbaa) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - CIBA can now issue delegated access tokens that name the user as `sub` and an agent or other actor as the RFC 8693 `act` claim.

  Return the actor from the new `resolveActor` option, which runs at `/oauth2/bc-authorize` after the client authenticates and the user is found. Return only an actor your server has verified, such as the authenticated client, and set `sub_profile: "service"` on a client or agent actor so pairwise clients do not read its `sub` as a pairwise subject. Throw an `APIError` from `resolveActor` to refuse the request. `sendNotification` receives the actor as `actor`, and the consent page receives it as JSON in the `actor` query parameter. A JWT access token carries `act`, and introspection of an opaque access token returns it. A delegated token gets no refresh token, and its returned `scope` leaves out `offline_access`. Without `resolveActor`, tokens are issued as before.

  The `cibaRequest` model has a new `actor` column. Run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM, before you upgrade.

- [#12712](https://github.com/better-auth/better-auth/pull/12712) [`a136236`](https://github.com/better-auth/better-auth/commit/a136236f0ac726473fe002df528547d8437dcbaa) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - CIBA deployments can now read a pending request on their own approval page with the new server-only `auth.api.getCibaRequest({ body: { requestId, userId } })`. It returns what to show the user (client, scopes, resources, binding message, ACR values, authorization details, actor, and expiry), or `null` when `completeCibaRequest` would refuse the request as unknown, such as a decided or expired request or one for another user, and when the client no longer exists. `sendNotification` now also receives the requested `resources`.

- [#12712](https://github.com/better-auth/better-auth/pull/12712) [`a136236`](https://github.com/better-auth/better-auth/commit/a136236f0ac726473fe002df528547d8437dcbaa) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Removed the `allowPublicClients` option. CIBA requires client authentication at the backchannel and token endpoints (CIBA §7.1), so clients registered with `token_endpoint_auth_method: "none"` are now always rejected with `invalid_client`. If you set `allowPublicClients` during the beta, remove it and register those clients with a secret or with `private_key_jwt`.

### Patch Changes

- [#12712](https://github.com/better-auth/better-auth/pull/12712) [`a136236`](https://github.com/better-auth/better-auth/commit/a136236f0ac726473fe002df528547d8437dcbaa) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - `/oauth2/bc-authorize` now answers `invalid_client` with status 401 and a `WWW-Authenticate` challenge, as CIBA §13 requires, instead of 400 when the client sent no credentials, used body credentials, or named no client. A request with no `client_id` now answers `invalid_client` instead of `invalid_request`. The description is unchanged.

- [#12690](https://github.com/better-auth/better-auth/pull/12690) [`ef8cf42`](https://github.com/better-auth/better-auth/commit/ef8cf42641499e7524e01f1a129970b4bcfd7744) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - CIBA ping mode now checks the stored `backchannel_client_notification_endpoint` again, and resolves its host name, before each ping. If the host resolves to a loopback, private, link-local, or other address that is not publicly routable, or the lookup fails, the server skips the ping and logs a warning. The decision is kept, and the client can still poll the token endpoint. Registration only checked the host name as written, so a public-looking name could still resolve to an internal address. The ping cannot be pinned to the address that was checked, so restrict outbound network access where you need a strict guarantee. On runtimes with no working DNS lookup, such as Cloudflare Workers, only the host name check applies. Clients whose endpoint resolves only to public addresses are unaffected. An endpoint whose origin is listed in `trustedOrigins` at initialization skips the lookup, so a client on an internal network keeps receiving pings.

- [#12690](https://github.com/better-auth/better-auth/pull/12690) [`ef8cf42`](https://github.com/better-auth/better-auth/commit/ef8cf42641499e7524e01f1a129970b4bcfd7744) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - CIBA clients can now receive ping notifications from providers running on Cloudflare Workers. The provider sends the notification only to the registered endpoint and treats a redirect as a failed delivery.

## 1.8.0-beta.10

### Minor Changes

- [#12509](https://github.com/better-auth/better-auth/pull/12509) [`dd55cd5`](https://github.com/better-auth/better-auth/commit/dd55cd57f48e6cebaa750bc6b7ae562daeded1e3) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - CIBA requests now accept `acr_values` and RFC 9396 `authorization_details`, which `/oauth2/bc-authorize` used to ignore.

  Requested ACR values reach `authenticationContext.resolve` as `requestedAcrValues` when the user approves from the link, and `sendNotification` receives them as `acrValues`. To accept authorization details, list each type in the new `authorizationDetailsTypes` option with a `validate` function. The user sees the details in `sendNotification` and on the consent page, `completeCibaRequest` can narrow them with `authorizationDetails`, and the granted details are returned in the token response, in a JWT access token, and at introspection of an opaque access token. A detail with `locations` goes only to a token for one of those resources, and a detail without `locations` goes to every token. When the user approves authorization details, the request is issued no refresh token. Without `authorizationDetailsTypes`, a request that carries `authorization_details` now fails with `invalid_authorization_details` instead of being approved without them.

  The `cibaRequest` model has two new columns, `acrValues` and `authorizationDetails`. Run `npx auth@latest migrate`, or `npx auth@latest generate` and apply the schema with your ORM, before you upgrade.

- [#12591](https://github.com/better-auth/better-auth/pull/12591) [`9cb5cd0`](https://github.com/better-auth/better-auth/commit/9cb5cd0e38ace8c1652bc91f0b3c6e01c21787ec) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A client can now register the authorization details types it will request with `authorization_details_types` (RFC 9396 §10), and CIBA rejects a request for any other type with `invalid_authorization_details`.

  Registration fails with `invalid_client_metadata` when a listed type is not in `authorizationDetailsTypes`. A client without the field may still request every configured type.

### Patch Changes

- [#12638](https://github.com/better-auth/better-auth/pull/12638) [`a614478`](https://github.com/better-auth/better-auth/commit/a61447845ed2f75518de8fedd16461a728dd2e50) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - When `baseURL` ends in `/`, the approval link sent to the user and the advertised `backchannel_authentication_endpoint` no longer contain a double slash.

- [#12646](https://github.com/better-auth/better-auth/pull/12646) [`e1aa7a4`](https://github.com/better-auth/better-auth/commit/e1aa7a40c36e09f4188b9b1bdfa4f8347474bb56) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Setup errors and warnings about conflicting OAuth provider extensions now say which extensions are involved. For example, a duplicate grant type fails with `OAuth Provider extension "ext-a" and extension "ext-b" both register grant type "…"`. Before, the message named only the grant type.

  Extensions accept an optional `name` for these messages. Plugin authors can pass their plugin's id to `extendOAuthProvider()`:

  ```ts
  extendOAuthProvider(ctx, { name: "my-plugin", grants: {/* ... */} });
  ```

  An extension without a `name` is described by its position in registration order and, when it registers one, a grant type or similar, such as `unnamed extension [#2](https://github.com/better-auth/better-auth/issues/2) (grant type "…")`. The CIBA, CIMD, device authorization, and token exchange extensions are named after their plugins.

## 1.8.0-beta.9

## 1.8.0-beta.8

## 1.8.0-beta.7

## 1.8.0-beta.6

## 1.8.0-beta.5

## 1.8.0-beta.4

## 1.8.0-beta.3

## 1.8.0-beta.2

## 1.8.0-beta.1

## 1.8.0-beta.0

### Minor Changes

- [#11785](https://github.com/better-auth/better-auth/pull/11785) [`25f7617`](https://github.com/better-auth/better-auth/commit/25f7617db6628059370da0280f1ce68fd2d92f1c) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `@better-auth/ciba`, OpenID Connect Client-Initiated Backchannel Authentication (CIBA) for `oauthProvider()`. A client that knows who it is acting for, such as an AI agent or a support tool, asks for a user by `login_hint` at `/oauth2/bc-authorize`. Your `sendNotification` callback sends that user a link, the user approves or denies on your existing sign-in and consent pages, and the client collects tokens at `/oauth2/token`, either by polling or after the server calls it back (`deliveryModes: ["poll", "ping"]`).

  Consent is always shown, only the user the client named can decide, and your consent page receives the client's `binding_message` to display. Clients register `backchannel_token_delivery_mode`, and for ping `backchannel_client_notification_endpoint`, through dynamic registration, a client metadata document, or admin client creation, and registration rejects unsupported values. Public clients such as agents can take part with `allowPublicClients`; they send `client_id` in the form body and should bind their tokens with DPoP. `resolveUser` receives the requesting client, so with open registration you can accept only identifiers that client was already given.

  The plugin adds a `cibaRequest` table. Run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.

- [#11812](https://github.com/better-auth/better-auth/pull/11812) [`0be0e23`](https://github.com/better-auth/better-auth/commit/0be0e23762756083c5ed858d6e85c895be3e810e) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Let your own app collect a CIBA decision, such as a one-tap approval from a push notification, and record it with `auth.api.completeCibaRequest`. `sendNotification` now receives the `requestId` to pass back, together with the `userId` your app authenticated and the decision. The call refuses a decision for any user other than the one the client named, and approved scopes must stay within the request and include `openid`. You can also pass the `authTime`, `acr`, and `amr` your app established, and they are issued in the ID token. A ping client is called back as it is after a decision from the link.

### Patch Changes

- [#11826](https://github.com/better-auth/better-auth/pull/11826) [`296133c`](https://github.com/better-auth/better-auth/commit/296133cc414ac24283ed8e33501e2e4e501ab5e0) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Device authorization and CIBA clients that poll the token endpoint with a missing or invalid DPoP proof now receive `invalid_dpop_proof` and can poll again with a valid proof. Previously the rejected poll used up the approved device code or CIBA request, so the user had to approve again. Clients that send valid proofs, or no proof when none is required, are unaffected.

  Extension grants that consume a one-time credential can call `provider.resolveConfirmation()` before the claim and pass its result to `issueTokens` as `confirmation` to get the same behavior.

- Updated dependencies [[`5fd850f`](https://github.com/better-auth/better-auth/commit/5fd850f926a9500219d14d13adc5cbd2436d105e), [`94907fd`](https://github.com/better-auth/better-auth/commit/94907fd5ffc10ad8263b77b49dd7539f5fa72651), [`034da07`](https://github.com/better-auth/better-auth/commit/034da07dbe92a0ce0ef735f2f31baff756cc25d1), [`ec0afde`](https://github.com/better-auth/better-auth/commit/ec0afdef5aa6d0dfb93b14357ae470977e28ecdf), [`ec0afde`](https://github.com/better-auth/better-auth/commit/ec0afdef5aa6d0dfb93b14357ae470977e28ecdf), [`034da07`](https://github.com/better-auth/better-auth/commit/034da07dbe92a0ce0ef735f2f31baff756cc25d1), [`296133c`](https://github.com/better-auth/better-auth/commit/296133cc414ac24283ed8e33501e2e4e501ab5e0), [`cd404a0`](https://github.com/better-auth/better-auth/commit/cd404a0b46abb929ccaea0129ecdff23fb074a8f), [`ed71a21`](https://github.com/better-auth/better-auth/commit/ed71a211e803f9f336ebfa83c4ef96610e621fd1), [`c750fc5`](https://github.com/better-auth/better-auth/commit/c750fc5ad2cccf42d3bc6de9820c510a8cdb2cd4), [`2417879`](https://github.com/better-auth/better-auth/commit/2417879cf6b2cb5c97ab679b83df0038760e045d), [`034da07`](https://github.com/better-auth/better-auth/commit/034da07dbe92a0ce0ef735f2f31baff756cc25d1), [`c750fc5`](https://github.com/better-auth/better-auth/commit/c750fc5ad2cccf42d3bc6de9820c510a8cdb2cd4), [`034da07`](https://github.com/better-auth/better-auth/commit/034da07dbe92a0ce0ef735f2f31baff756cc25d1), [`9f53222`](https://github.com/better-auth/better-auth/commit/9f532221bee7cd99a5c4e6593313dead87bf8f0d), [`c7c8331`](https://github.com/better-auth/better-auth/commit/c7c83314009540df912fb608b746fad3c02214ee), [`0d4609f`](https://github.com/better-auth/better-auth/commit/0d4609f4a904d919353acae7ef04d2e68ff1be15), [`6e5a88e`](https://github.com/better-auth/better-auth/commit/6e5a88e57b0b5253bc49797cede415ff27a82931)]:
  - better-auth@1.8.0-beta.0
  - @better-auth/oauth-provider@1.8.0-beta.0
  - @better-auth/core@1.8.0-beta.0
