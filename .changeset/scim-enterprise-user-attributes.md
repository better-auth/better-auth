---
"@better-auth/scim": minor
---

Add the standard Enterprise User extension (`employeeNumber`, `costCenter`, `organization`, `division`, `department`, `manager`) and the classic `title`, `userType`, `preferredLanguage`, `locale`, `timezone`, `phoneNumbers`, `addresses`, `roles`, and `entitlements` User attributes, plus `name.middleName`, `name.honorificPrefix`, and `name.honorificSuffix`. All are readable, filterable by `type` or `primary`, and writable through PATCH, including the classic Microsoft Entra `manager` path aliases.

Add `compatibility.microsoftEntra.acceptLegacyGroupSchema` to accept Microsoft Entra's legacy, attribute-less Group schema marker on `POST /Groups` without storing or returning it.

Microsoft Entra interoperability fixes:

- A bare `attributes`/`excludedAttributes` name for an Enterprise User sub-attribute (for example `?attributes=manager`) no longer drops the whole extension from the response.
- Multi-op PATCH paths filtered by `[primary eq true]` (or `[primary eq "true"]`) with a sub-attribute target now work on `emails`, `phoneNumbers`, `addresses`, `roles`, and `entitlements`.
- A single-element array wrapping a scalar PATCH replace value is unwrapped instead of rejected, on User scalars, Enterprise User fields, and Group `displayName` and `externalId`.
- Removing the last sub-attribute of a complex attribute (for example `manager.value`) clears the emptied Enterprise User extension instead of leaving it declared.
- Replacing `manager` with an empty string clears it, matching how Microsoft Entra removes a manager.
- A PATCH with an empty `Operations` array is a valid no-op instead of an error, for both Users and Groups.
- `PATCH /Users/:id` and `PATCH /Groups/:id` return `200 OK` with the updated resource instead of `204 No Content`.
