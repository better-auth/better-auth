# better-auth

## 1.3.5

### Patch Changes

- 1421360: fix: cast dates from session to Date when using date methods
- e5f3f31: feat(passkey): allow custom passkey name during registration
- e4af253: fix(twitter): refreshing twitter utilizes basic
- b27221b: feat: allow returning false from `generateId` callback to imply database-generated ID
- 375fff5: fix(org): incorrect use of find org by slug
- 4833a4b: fix(api key): key creation bug where remaining was incorrectly defaulting to a capped value instead of allowing null
- 7fa90f8: fix(organization): updated types for the user argument in `allowUserToCreateOrganization` to support custom fields
- 60c92fa: fix(jwt): add options to plugin
- d1d593f: fix(admin): export type definitions from the admin plugin
- 29c0df5: add support for passing a loginHint to the Microsoft OAuth
- c726753: feat: support for multiple aud for apple oauth
- 978b285: chore: remove unnecessary console log when ip isn't found for rate limiting

## 1.3.4

### Patch Changes

- 2bd2fa9: Added support for listing organization members with pagination, sorting, and filtering, and improved client inference for additional organization fields. Also fixed date handling in rate limits and tokens, improved Notion OAuth user extraction, and ensured session is always set in context.

  Organization

  - Added listMembers API with pagination, sorting, and filtering.
  - Added membersLimit param to getFullOrganization.
  - Improved client inference for additional fields in organization schemas.
  - Bug Fixes
  - Fixed date handling by casting DB values to Date objects before using date methods.
  - Fixed Notion OAuth to extract user info correctly.
  - Ensured session is set in context when reading from cookie cach
