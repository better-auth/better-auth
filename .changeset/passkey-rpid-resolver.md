---
"@better-auth/passkey": patch
---

`rpID` can now be resolved per request, and the new `expectedRPID` option sets which RP ID(s) a registration or authentication response may be bound to. This lets one server accept passkeys from several relying parties, including Chrome extension pages, where the RP ID hash in the authenticator data is of `chrome-extension://<id>` rather than of the RP ID sent in the options. Existing configurations behave as before.
