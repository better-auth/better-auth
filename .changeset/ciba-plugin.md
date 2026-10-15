---
"@better-auth/ciba": minor
---

Add `@better-auth/ciba`, OpenID Connect Client-Initiated Backchannel Authentication for `oauthProvider()`. A client such as an AI agent, CLI, or device starts a request at `/oauth2/bc-authorize`, the user approves or denies it on their own device, and the client receives tokens at the token endpoint. Poll and ping delivery are supported, and tokens can be DPoP-bound and scoped to RFC 8707 resources.

Approval UIs can open a request from the notification link or list the user's pending requests and decide by `request_id`. Server code can decide a request with `auth.api.completeCibaRequest`, for example to approve under a policy. Deployments can validate requests and attach their own fields (`validateRequest`, `schema.cibaRequest.additionalFields`), refuse or add claims at issuance (`beforeTokenIssuance`), accept RFC 9396 `authorization_details` of configured types, and opt in to public clients (`allowPublicClients`).

Clients register with the CIBA grant type and declare `backchannel_token_delivery_mode` (and, for ping, `backchannel_client_notification_endpoint`), as top-level fields with dynamic registration or in `metadata` when an admin creates the client. Registration rejects an unsupported mode or an unsafe ping endpoint with `invalid_client_metadata`. Import the approval-page client plugin from `@better-auth/ciba/client`.
