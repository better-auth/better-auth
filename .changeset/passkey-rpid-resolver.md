---
"@better-auth/passkey": patch
---

`rpID` can now be resolved per request, and the new `expectedRPID` option sets which RP ID(s) a registration or authentication response may be bound to. This lets one server accept passkeys from several relying parties, including Chrome extension pages, where the RP ID hash in the authenticator data is of `chrome-extension://<id>` rather than of the RP ID sent in the options. When a wildcard in `baseURL.allowedHosts` covers a resolved `rpID` or an `expectedRPID`, only a reported origin that is trusted exactly is accepted, as for a static `rpID`.

Existing configurations verify against the same RP ID and origins as before. One change applies to all: the challenge is now read before the origin is checked, so a verify request with a rejected origin consumes its challenge, and the client has to request new options before retrying.
