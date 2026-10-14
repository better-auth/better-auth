---
"@better-auth/ciba": minor
---

Add `@better-auth/ciba`, OpenID Connect Client-Initiated Backchannel Authentication for `oauthProvider()`. A client such as an AI agent, CLI, or device starts a request at `/oauth2/bc-authorize`, the user approves or denies it on their own device, and the client receives tokens at the token endpoint. Poll and ping delivery are supported, and tokens can be DPoP-bound and scoped to RFC 8707 resources.

Clients register with the CIBA grant type and declare `backchannel_token_delivery_mode` (and, for ping, `backchannel_client_notification_endpoint`) in their metadata. Import the approval-page client plugin from `@better-auth/ciba/client`.
