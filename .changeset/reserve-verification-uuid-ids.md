---
"better-auth": patch
---

Reservations keyed by `reserveVerificationValue` now hold under `advanced.database.generateId: "uuid"`. The reservation id is derived from the identifier, but it was base64url encoded, so the UUID id strategy rejected it and swapped in a random UUID. Each replay then wrote its own row and won the reservation, which turned SAML assertion replay protection into a no-op. The digest is now formatted as a name-based UUID when that strategy is configured, and every other strategy keeps the existing base64url key. `generateId: "serial"` cannot represent a derived id at all, so it throws instead of silently accepting the replay.
