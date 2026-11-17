---
"@better-auth/oauth-provider": minor
---

A `private_key_jwt` client assertion can now name an endpoint on the host clients actually reach it at. Set the new `advertisedBaseURL` option when a gateway on another host forwards the server-to-server endpoints to your app, and each endpoint's own URL under that base is accepted wherever its `baseURL` URL is. The assertion stays bound to the endpoint it names. This does not widen the default `assertionAudience: "issuer"`, which accepts no endpoint URL.
