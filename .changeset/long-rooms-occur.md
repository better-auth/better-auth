---
"@better-auth/organization": minor
"@better-auth/oauth-provider": patch
"better-auth": patch
"@better-auth/test-utils": patch
"@better-auth/api-key": patch
"@better-auth/stripe": patch
"@better-auth/scim": patch
"auth": patch
"@better-auth/sso": patch
---

feat: organization plugin rewrite

The organization plugin has been refactored and extracted into its own package `@better-auth/organization`. This brings a modular addon system, improved type safety, and new features while maintaining API compatibility for most use cases.

## Breaking Changes

### Package Migration

```diff
- import { organization } from "better-auth/plugins"
+ import { organization } from "@better-auth/organization"

- import { organizationClient } from "better-auth/client/plugins"
+ import { organizationClient } from "@better-auth/organization/client"
```

### Teams & Dynamic Access Control are now Addons

```diff
- organization({ teams: { enabled: true }, dynamicAccessControl: { enabled: true } })
+ import { teams } from "@better-auth/organization/teams"
+ import { dynamicAccessControl } from "@better-auth/organization/dynamic-access-control"
+ organization({ use: [teams(), dynamicAccessControl()] })
```

Client-side addons follow the same pattern:

```diff
- organizationClient({ teams: true })
+ import { teamsClient } from "@better-auth/organization/teams/client"
+ organizationClient({ use: [teamsClient()] })
```

### Hook Changes

- `organizationHooks` option renamed to `hooks`
- All hook callbacks now receive `(data, ctx: GenericEndpointContext)` instead of `(data)` or `(data, request)`
- Team and dynamic access control hooks moved to their respective addon configurations

### Callback Signature Changes

- `sendInvitationEmail`: second parameter changed from `Request` to `GenericEndpointContext`
- `organizationLimit`: now returns a `number` (the limit) instead of a `boolean`
- `membershipLimit`: now receives an additional `ctx` parameter

### `listOrganizations` Response Shape

Now returns a paginated object `{ organizations, total, limit, offset }` instead of a flat array.

### Server API Renames

| Old | New |
|-----|-----|
| `listOrganizationTeams` | `listTeams` |
| `createOrgRole` / `deleteOrgRole` / `listOrgRoles` / `getOrgRole` / `updateOrgRole` | `createRole` / `deleteRole` / `listRoles` / `getRole` / `updateRole` |

### Other Breaking Changes

- `addMember` is now server-only (rejects HTTP calls with 403; use the invitation system instead)
- `organizationLimit` default changed from unlimited to **100**
- `requireEmailVerificationOnInvitation` default changed from `true` to `false`
- Teams addon: `maximumTeams` and `maximumMembersPerTeam` now default to **100** (previously unlimited)
- `getFullOrganization` no longer accepts `organizationSlug` — use `getOrganization` or pass `organizationId` with `defaultOrganizationIdField: "slug"`
- Team/role schema fields moved to their respective addon schema configs
- Error codes renamed: `YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION` → `NOT_ALLOWED_TO_CREATE_NEW_ORG`, `YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS` → `REACHED_ORG_LIMIT`

## New Features

### Addon Architecture

Features like teams and dynamic access control are now opt-in addons, so the base plugin only ships what you actually use:

```ts
import { organization } from "@better-auth/organization"
import { teams } from "@better-auth/organization/teams"
import { dynamicAccessControl } from "@better-auth/organization/dynamic-access-control"

organization({
    use: [teams(), dynamicAccessControl()],
})
```

### Shareable Invitation URLs

Generate invitation URLs that can be shared via any channel (Slack, SMS, in-app):

```ts
const { url } = await authClient.organization.getInvitationURL({
    email: "user@example.com",
    role: "member",
    callbackURL: "https://yourapp.com/dashboard",
})
```

### `createOrgOnSignUp`

Auto-create an organization when a user signs up:

```ts
organization({
    createOrgOnSignUp: async ({ user }) => ({
        name: `${user.name}'s Workspace`,
    }),
})
```

### `privacy`

Control what member and invitation data is exposed in API responses:

```ts
organization({
    privacy: {
        hiddenMemberFields: ["email", "image"],
        hiddenInvitationFields: ["email"],
    },
})
```

### Invite by `userId`

```ts
await auth.api.createInvitation({
    body: { organizationId: "org-id", userId: "user-id", role: "member" },
})
```

### Access Control Helpers

```ts
import { hasPermission, defaultRoles } from "@better-auth/organization/access"
```

### Other New Features

- **`getOrganization`** — lightweight endpoint to fetch by ID or slug
- **`disableSlugs`** / **`defaultOrganizationIdField`** — disable slugs or use `"slug"` as the default identifier
- **`listMembers` enhancements** — supports `organizationSlug`, plus `in`, `not_in`, `starts_with`, `ends_with` filter operators
- **`getActiveMemberRole`** — now supports `organizationSlug`
- **Teams addon** — new `enableSlugs`, `defaultTeamIdField`, scoped hooks, `getTeam`, `updateTeamMember`, paginated `listTeamMembers`
- **Dynamic role validation** on invitation creation
- **`cancelPendingInvitationsOnReInvite`** no longer requires the `resend` flag
- **Email verification gate** extended to `getInvitation` and `listUserInvitations`
