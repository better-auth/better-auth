# @better-auth/sso

## 1.3.5

### Patch Changes

- Updated dependencies [1421360]
- Updated dependencies [e5f3f31]
- Updated dependencies [e4af253]
- Updated dependencies [b27221b]
- Updated dependencies [375fff5]
- Updated dependencies [4833a4b]
- Updated dependencies [7fa90f8]
- Updated dependencies [60c92fa]
- Updated dependencies [d1d593f]
- Updated dependencies [29c0df5]
- Updated dependencies [c726753]
- Updated dependencies [978b285]
  - better-auth@1.3.5

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

- Updated dependencies [2bd2fa9]
  - better-auth@1.3.4
