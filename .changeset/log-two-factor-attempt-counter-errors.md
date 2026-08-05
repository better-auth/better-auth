---
"better-auth": patch
---

Log the underlying error when the two-factor attempt counter cannot be read or written, instead of discarding it. Behaviour is unchanged and these failures still fail closed, but an adapter or schema problem previously surfaced only as a generic "Invalid two factor cookie", giving no indication of the real cause.
