# @better-auth/cli

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
  - Ensured session is set in context when reading from cookie cache

- Updated dependencies [2bd2fa9]
  - better-auth@1.3.4
