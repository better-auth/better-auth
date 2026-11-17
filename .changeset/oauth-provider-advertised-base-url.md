---
"@better-auth/oauth-provider": minor
---

A `private_key_jwt` client assertion can now name an endpoint on the host clients actually reach it at. Set the new `advertisedBaseURL` option when a gateway on another host forwards the server-to-server endpoints to your app, and each endpoint's own URL under that base is accepted wherever its `baseURL` URL is. The assertion stays bound to the endpoint it names. Under the default `assertionAudience: "issuer"` the token, introspection, revocation and PAR endpoints accept no endpoint URL, so the option changes nothing there; `POST /oauth2/client/rotate-keys` accepts its own URL in either mode, so its advertised URL is accepted too.
