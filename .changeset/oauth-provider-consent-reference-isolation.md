---
"@better-auth/oauth-provider": patch
---

If `postLogin.consentReferenceId` returns no reference for some authorizations (for example, it returns an organization ID only for organization scopes), consent is now kept separate per reference. Approving consent without a reference no longer overwrites the consent stored for an organization, and an authorization without a reference no longer skips the consent prompt because the user consented under an organization. Previously, approving `read write` without a reference could replace an organization's stored `read` consent, so later authorizations for that organization were granted `write` without asking. An empty string is now treated the same as no reference.

Users may see the consent prompt once for authorizations that were previously approved through another reference's consent. Consent overwritten before this release is not repaired; users can review or revoke it through the consent management endpoints. Setups without `consentReferenceId`, or that always return a reference, are unaffected.
