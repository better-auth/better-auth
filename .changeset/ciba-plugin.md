---
"@better-auth/ciba": minor
---

Add `@better-auth/ciba`, an OpenID Connect Client-Initiated Backchannel Authentication plugin. A client (an AI agent, CLI, or device) starts a backchannel request, the user approves on a separate device, and the client receives tokens. No browser redirect is involved.

Supports poll, ping, and push token delivery and DPoP-bound access tokens. The user approves or rejects with either the raw `auth_req_id` from the approval link, or, for a first-party UI that lists a user's own pending requests, the request's `request_id`. Ownership is enforced by the session in both cases.
