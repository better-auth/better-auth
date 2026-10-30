---
"@better-auth/sso": patch
---

Deleting the user who registered an SSO provider no longer deletes the provider. `ssoProvider.userId` is now optional and its foreign key uses `on delete set null`, so an organization's SSO connection survives the departure of the member who set it up. Existing databases keep their current constraint until it is migrated by hand.
