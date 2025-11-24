# Organization Plugin Refactoring Plan

## Overview
This plan outlines the changes needed to simplify the organization plugin by:
1. Removing inbuilt access control and dynamic access control
2. Making teams always enabled (non-optional)
3. Introducing dedicated role tables (`organization_roles`, `team_roles`, and `platform_roles`)
4. Supporting multiple roles per user via junction tables
5. Implementing built-in roles vs custom roles with Zed schema permissions
6. Adding platform entity with platform roles for admin access control

## Key Changes

### 1. Schema Changes

#### New Tables to Add:

**`platform` table:**
- `id` (string, primary key) - single platform entity (singleton)
- `name` (string, required) - platform name
- `created_at` (date, required)
- `updated_at` (date, optional)

**`platform_roles` table:**
- `id` (string, primary key)
- `platform_id` (string, foreign key → platform.id)
- `type` (string, required, unique per platform) - unique identifier (like a slug), e.g., "platform_admin", "platform_user", "support_admin"
  - **Unique constraint**: `UNIQUE(platform_id, type)` - ensures one role per type per platform (MUST BE ENFORCED)
  - Role type is derived from role name (e.g., "Support Admin" → "support_admin")
  - Multiple roles can share permissions but must have different types
- `name` (string, required) - display name
- `description` (string, optional) - role description
- `is_built_in` (boolean, required, default: false) - marks built-in roles that cannot be deleted/modified
- `permissions` (json/zed schema, optional) - permissions defined in Zed schema format
- `created_at` (date, required)
- `updated_at` (date, optional)

**`organization_roles` table:**
- `id` (string, primary key)
- `organization_id` (string, foreign key → organization.id)
- `type` (string, required, unique per organization) - unique identifier (like a slug), e.g., "owner", "admin", "member", "engineering_admin", "sales_admin"
  - **Unique constraint**: `UNIQUE(organization_id, type)` - ensures one role per type per organization (MUST BE ENFORCED)
  - Role type is derived from role name (e.g., "Engineering Admin" → "engineering_admin")
  - Multiple roles can share permissions but must have different types
- `name` (string, required) - display name (e.g., "Engineering Admin", "Sales Admin")
- `description` (string, optional) - role description
- `is_built_in` (boolean, required, default: false) - marks built-in roles that cannot be deleted/modified
- `permissions` (json/zed schema, optional) - permissions defined in Zed schema format, references built-in role permissions
- `created_at` (date, required)
- `updated_at` (date, optional)

**`team_roles` table:**
- `id` (string, primary key)
- `team_id` (string, foreign key → team.id)
- `type` (string, required, unique per team) - unique identifier (like a slug), e.g., "lead", "member", "engineering_lead"
  - **Unique constraint**: `UNIQUE(team_id, type)` - ensures one role per type per team (MUST BE ENFORCED)
  - **Scope**: Team roles are scoped to the team, not the organization. Same role type can exist in different teams.
  - Role type is derived from role name (e.g., "Engineering Lead" → "engineering_lead")
  - Multiple roles can share permissions but must have different types
- `name` (string, required) - display name
- `description` (string, optional) - role description
- `is_built_in` (boolean, required, default: false) - marks built-in roles that cannot be deleted/modified
- `permissions` (json/zed schema, optional) - permissions defined in Zed schema format, references built-in role permissions
- `created_at` (date, required)
- `updated_at` (date, optional)

**`member_organization_roles` junction table:**
- `id` (string, primary key)
- `member_id` (string, foreign key → member.id)
- `organization_id` (string, required) - for lookups: organization_id + role_type uniquely identifies the role
- `role_type` (string, required, indexed) - the canonical role type (e.g., "owner", "admin", "member") - stable identifier
- `created_at` (date, required)
- **Note**: Full role details (name, description, permissions) are looked up using `organization_id + role_type` from `organization_roles` table
- **API Note**: This junction table data is exposed as `organizationRoles: string[]` in API responses (array of role types)

**`member_team_roles` junction table:**
- `id` (string, primary key)
- `team_member_id` (string, foreign key → team_member.id)
- `team_id` (string, required) - for lookups: team_id + role_type uniquely identifies the role
- `role_type` (string, required, indexed) - the canonical role type (e.g., "lead", "member") - stable identifier
- `created_at` (date, required)
- **Note**: Full role details (name, description, permissions) are looked up using `team_id + role_type` from `team_roles` table
- **API Note**: This junction table data is exposed as `teamRoles: string[]` in API responses (array of role types)

**`user_platform_roles` junction table:**
- `id` (string, primary key)
- `user_id` (string, foreign key → user.id)
- `platform_id` (string, required) - for lookups: platform_id + role_type uniquely identifies the role
- `role_type` (string, required, indexed) - the canonical role type (e.g., "platform_admin", "platform_user") - stable identifier
- `created_at` (date, required)
- **Note**: Full role details (name, description, permissions) are looked up using `platform_id + role_type` from `platform_roles` table
- **API Note**: This junction table data is exposed as `platformRoles: string[]` in API responses (array of role types)

#### Tables to Modify:

**`user` table (admin plugin):**
- ❌ Remove: `role` field (string) - replaced with `user_platform_roles` junction table
- ❌ Remove: `platformRoleId` field (string) - replaced with junction table
- ✅ Keep: all other fields

**`member` table:**
- ❌ Remove: `role` field (string)
- ✅ Keep: `id`, `organization_id`, `user_id`, `created_at`

**`team_member` table:**
- ✅ Keep as is (no role field currently, roles will be via junction table)

**`invitation` table:**
- ❌ Remove: `role` field (string)
- ✅ Add: `organization_roles` (array of strings, optional) - for organization invitations, e.g., ["admin", "member"]
- ✅ Add: `team_roles` (array of strings, optional) - for team invitations, e.g., ["lead", "member"]
- **Note**: Store role types (strings), not role IDs. When accepting invitation, look up role IDs from types.
- **API Note**: Exposed as `organizationRoles: string[]` and `teamRoles: string[]` in API requests/responses

### 2. Role Type Storage in Junction Tables

#### Rationale:
- **UX Requirement**: When displaying members/users, role types should be immediately visible
- **Query Performance**: Indexed `role_type` allows fast queries without joins for basic role display
- **Simplicity**: Store only the stable identifier (`role_type`), look up full details when needed
- **AuthZed Integration**: Since AuthZed handles authorization, we don't need permissions in junction tables
- **Flexibility**: Can always get full role details (name, description, permissions) using `resource_id + role_type`

#### Design Decision:
Store only `role_type` in junction tables, along with the resource ID for lookups:

**Junction Table Structure:**
- `role_type` (string, indexed) - the canonical role type (e.g., "admin", "member", "owner")
- `resource_id` (organization_id, team_id, or platform_id) - for looking up full role details
- No foreign key to role table - roles are identified by `resource_id + role_type` combination

**Benefits:**
- ✅ Simple junction tables - only store stable identifier
- ✅ Fast queries with index on `role_type`
- ✅ No denormalization - no sync needed when role names change
- ✅ Users see normal role types directly (e.g., "admin", "member")
- ✅ Full role details available when needed via `resource_id + role_type` lookup
- ✅ Role names/descriptions can be updated without touching junction tables
- ✅ Cleaner data model - single source of truth for role details

**Lookup Pattern:**
```typescript
// When displaying member with roles - API returns simple array
member.organizationRoles // ["admin", "member"] - simple string array ✅

// NOT nested objects:
// member.organizationRoles // ❌ Don't return [{ id, type, name, ... }] - this would conflict!
// Note: The field name is `organizationRoles` but it contains an array of role type strings

// When full role details needed - use separate lookup endpoint
const roles = await getRolesByTypes(organizationId, ["admin", "member"])
// GET /organization/roles/by-types?types=admin,member
// Returns full role objects with name, description, permissions, etc.
```

**Index Strategy:**
- Index on `role_type` for fast filtering/querying
- Index on `resource_id + role_type` for lookups
- Composite index on `member_id + organization_id` for member role queries

### 3. Built-in Roles & Permissions System

#### Built-in Roles Concept:
- **Built-in roles** are system-defined roles that cannot be deleted or modified
- Built-in roles have default permissions defined in **Zed schema** format
- Custom roles can be created by users but cannot modify built-in roles
- Built-in roles serve as templates that can be referenced by custom roles

#### Built-in Role Types:

**Platform Built-in Roles:**
- `platform_admin` - Full platform administration access
- `platform_user` - Standard platform user access

**Organization Built-in Roles:**
- `owner` - Full organization access
- `admin` - Administrative access
- `member` - Basic member access

**Team Built-in Roles:**
- `lead` - Team leadership role
- `member` - Basic team member

#### Zed Schema Integration:
- Permissions are defined using Zed schema format (similar to AuthZed)
- Built-in roles have permissions stored in `permissions` field as JSON/Zed schema
- Built-in roles have a relationship with the resource (org, team, platform) via Zed schema
- Custom roles can reference built-in role permissions or define their own
- Permission checking will use Zed schema evaluation

#### Zed Schema Structure for Built-in Roles:

**Platform Role Permissions:**
```zed
// Built-in platform_admin role permissions
{
  "platform": {
    "manage_users": true,
    "manage_organizations": true,
    "view_platform": true,
    "manage_roles": true
  }
}

// Built-in platform_user role permissions
{
  "platform": {
    "view_platform": true
  }
}
```

**Organization Role Permissions:**
```zed
// Built-in owner role permissions
{
  "organization": {
    "manage": true,
    "view": true,
    "invite": true,
    "manage_teams": true,
    "manage_roles": true,
    "delete": true
  }
}

// Built-in admin role permissions
{
  "organization": {
    "manage": true,
    "view": true,
    "invite": true,
    "manage_teams": true
  }
}

// Built-in member role permissions
{
  "organization": {
    "view": true
  }
}
```

**Team Role Permissions:**
```zed
// Built-in lead role permissions
{
  "team": {
    "manage": true,
    "view": true,
    "invite": true,
    "manage_members": true
  }
}

// Built-in member role permissions
{
  "team": {
    "view": true
  }
}
```

#### Built-in Role Relationship with Resources:
- Built-in roles are tied to their resource type (platform, organization, team)
- The `built_in_role` relation in Zed schema prevents modification/deletion
- Built-in roles serve as the foundation that custom roles can extend
- Custom roles can inherit permissions from built-in roles or define new ones

### 4. Platform Entity

#### Platform Concept:
- Single platform entity in the database (singleton pattern)
- Users have platform roles that determine admin access
- Platform roles control access to admin plugin features
- Platform is created automatically on first admin plugin initialization

#### Platform Role Assignment:
- Users can have multiple platform roles
- Platform roles determine what admin actions a user can perform
- Admin plugin checks platform roles instead of `user.role` field
- Platform roles are checked via `user_platform_roles` junction table

#### Admin Access Control:
- Admin plugin endpoints check if user has required platform role(s)
- Permission checks use Zed schema evaluation against platform role permissions
- Example: `platform_admin` role has `manage_users: true`, allowing user management
- Multiple platform roles are evaluated with OR logic (user has permission if any role grants it)

### 5. Code Changes

#### Files to Modify:

1. **`schema.ts`** (organization plugin)
   - Remove `role` from `MemberDefaultFields`
   - Remove `role` from `InvitationDefaultFields`
   - Add new schema definitions for:
     - `OrganizationRoleDefaultFields` (with `is_built_in`, `permissions`)
     - `TeamRoleDefaultFields` (with `is_built_in`, `permissions`)
     - `MemberOrganizationRoleDefaultFields` (with `role_type`, `role_name` denormalized fields)
     - `MemberTeamRoleDefaultFields` (with `role_type`, `role_name` denormalized fields)
     - `UserPlatformRoleDefaultFields` (with `role_type`, `role_name` denormalized fields)
   - Update `memberSchema` to remove `role`
   - Update `invitationSchema` to remove `role` and add role arrays
   - Create new schemas for role tables
   - Update type inference types
   - Add Zed schema type definitions for permissions

2. **`organization.ts`**
   - Remove all access control related code:
     - Remove `ac` option handling
     - Remove `roles` option handling
     - Remove `dynamicAccessControl` option handling
     - Remove `hasPermission` endpoint
     - Remove `DynamicAccessControlEndpoints` type
   - Remove conditional team support:
     - Remove `teams?.enabled` checks
     - Always include team schema
     - Always include team endpoints
     - Remove conditional types based on `teams.enabled`
   - Update schema building to always include:
     - `team` table
     - `team_member` table
     - `organization_roles` table
     - `team_roles` table
     - `member_organization_roles` table
     - `member_team_roles` table
   - Remove `role` field from `member` schema
   - Remove `role` field from `invitation` schema

3. **`types.ts`**
   - Remove `ac?: AccessControl` option
   - Remove `roles?: { [key: string]: Role<any> }` option
   - Remove `dynamicAccessControl?: { enabled: boolean, ... }` option
   - Remove `teams?: { enabled: boolean, ... }` option
   - Make teams always enabled (remove optional wrapper)
   - Update schema types to include new role tables

4. **`adapter.ts`**
   - Remove role-related methods from member operations
   - Add new methods:
     - `createOrganizationRole(data)` - creates role, enforces unique constraint on `(organization_id, type)`
     - `updateOrganizationRole(roleId, data)` - updates role, prevents updating built-in roles
     - `deleteOrganizationRole(roleId)` - deletes role, validates role is not in use (check junction tables)
     - `listOrganizationRoles(organizationId)` - lists all roles, can filter by types
     - `getOrganizationRole(roleId)` - gets single role by ID
     - `getOrganizationRolesByTypes(organizationId, roles: string[])` - batch lookup by types
     - `createTeamRole(data)` - creates role, enforces unique constraint on `(team_id, type)`
     - `updateTeamRole(roleId, data)` - updates role, prevents updating built-in roles
     - `deleteTeamRole(roleId)` - deletes role, validates role is not in use (check junction tables)
     - `listTeamRoles(teamId)` - lists all roles for team, can filter by types
     - `getTeamRole(roleId)` - gets single role by ID
     - `getTeamRolesByTypes(teamId, roles: string[])` - batch lookup by types
     - `assignOrganizationRolesToMember(memberId, organizationId, roles: string[])` - stores role_type and organization_id
       - **Validation**: Verify all role types exist in `organization_roles` table before assignment
       - **Error**: Return clear error if role type doesn't exist: "Role type 'admin' does not exist for this organization"
     - `removeOrganizationRolesFromMember(memberId, roles: string[])`
     - `getMemberOrganizationRoles(memberId)` - returns array of role types (e.g., ["admin", "member"])
     - `getOrganizationRolesByTypes(organizationId, roles: string[])` - lookup full role details by types (returns full role objects)
     - `assignTeamRolesToMember(teamMemberId, teamId, roles: string[])` - stores role_type and team_id
       - **Validation**: Verify all role types exist in `team_roles` table before assignment
       - **Error**: Return clear error if role type doesn't exist: "Role type 'lead' does not exist for this team"
     - `removeTeamRolesFromMember(teamMemberId, roles: string[])`
     - `getMemberTeamRoles(teamMemberId)` - returns array of role types
     - `getTeamRolesByTypes(teamId, roles: string[])` - lookup full role details by types (returns full role objects)
   - Update `createMember` to not accept role
   - Update `updateMember` to work with role assignments instead of single role
   - Update `findMemberByOrgId` to include role types (from junction table - no join needed)
   - Update `listMembers` to include role types for each member (from junction table - no join needed)
   - Add `getMemberRolesWithDetails(memberId, organizationId)` - returns full role objects when needed
   - When assigning roles, store `role_type` and `organization_id` in junction table

5. **`routes/crud-members.ts`**
   - Update `addMember`:
     - Change `role` parameter to `organizationRoles` (array of strings like ["admin", "member"])
     - **Validation**: Verify all role types exist in `organization_roles` table before assignment
     - Remove role validation against access control
     - Create member without role
     - Assign roles via junction table (store role_type and organization_id)
   - Update `updateMemberRole` → rename to `updateMemberRoles`:
     - Accept `organizationRoles` array (e.g., ["admin", "member"])
     - **Validation**: Verify all role types exist before updating
     - Update junction table entries (replace all roles)
     - Store role_type and organization_id in junction table
   - Update `getActiveMember` to include `organizationRoles: string[]` (from junction table - no join needed)
     - **Response format**: `{ ...member, organizationRoles: ["admin", "member"] }` - simple array of strings
   - Update `getActiveMemberRole` → rename to `getActiveMemberRoles`:
     - Return array of role types (e.g., ["admin", "member"]) - simple string array, not objects
   - Update `listMembers`:
     - Include `organizationRoles: string[]` for each member (from junction table - no join needed)
     - **Response format**: Returns role types as array of strings, NOT nested role objects
     - Example: `{ members: [{ id: "...", organizationRoles: ["admin", "member"] }] }`

6. **`routes/crud-team.ts`**
   - Update `addTeamMember`:
     - Accept `teamRoles` array (e.g., ["lead", "member"])
     - **Validation**: Verify all role types exist in `team_roles` table before assignment
     - Assign roles via junction table
     - Store role_type and team_id in junction table
   - Update team member listing:
     - Include `teamRoles: string[]` for each member (from junction table - no join needed)
     - **Response format**: Returns role types as array of strings, NOT nested role objects
     - Example: `{ members: [{ id: "...", teamRoles: ["lead", "member"] }] }`
     - **Scope**: Team roles are scoped to the team, not the organization

7. **`routes/crud-invites.ts`**
   - Update `createInvitation`:
     - Change `role` to `organizationRoles` (array of strings like ["admin", "member"])
     - Add `teamRoles` (array of strings) for team invitations
     - Store role types in invitation table (`organization_roles`, `team_roles` columns)
     - **Validation**: Validate that role types exist before creating invitation
   - Update `acceptInvitation`:
     - Look up role IDs from role types stored in invitation
     - **Validation**: Validate role types still exist (roles might have been deleted)
     - Assign roles from invitation to new member
     - Store role_type and organization_id/team_id in junction tables
   - Update invitation schemas to use `organizationRoles` and `teamRoles`

8. **`routes/crud-org.ts`**
   - Update `createOrganization`:
     - Create default organization roles with reserved types: "owner", "admin", "member"
     - **Unique constraint**: Built-in roles are created first, preventing custom roles from using same types
     - Assign creator role to the creator (store role_type "owner" in junction table)
     - Store role_type and organization_id in junction table
   - Add role management endpoints (see API Changes section)
   - Remove access control permission checks

9. **`routes/crud-access-control.ts`**
   - ❌ DELETE THIS FILE (no longer needed)

10. **`has-permission.ts`**
    - ❌ DELETE THIS FILE (no longer needed)

11. **`permission.ts`**
    - ❌ DELETE THIS FILE (no longer needed)

12. **`access/` directory**
    - ❌ DELETE THIS DIRECTORY (no longer needed)

13. **`call.ts`**
    - Remove access control related context
    - Remove role validation middleware
    - Update `orgMiddleware` to not check permissions

14. **`client.ts`**
   - Remove `hasPermission` method
   - Update member methods to work with role arrays
   - Add role management methods

15. **`admin/schema.ts`** (admin plugin)
   - Add `platform` table schema
   - Update `platformRole` schema to include:
     - `is_built_in` field
     - `permissions` field (Zed schema format)
   - Add `user_platform_roles` junction table schema
   - Remove `platformRoleId` from user schema (replaced with junction table)

16. **`admin/admin.ts`** (admin plugin)
   - Remove `user.role` field usage
   - Update all endpoints to check platform roles via junction table
   - Update `setRole` → `setPlatformRoles` (accepts `platformRoles: string[]` array)
     - Update `createUser` to assign platform roles via junction table (accepts `platformRoles: string[]`)
     - Update `adminUpdateUser` to work with platform roles (accepts `platformRoles: string[]`)
   - Update permission checks to use platform roles
   - Add platform initialization logic (create singleton platform entity)
   - Update `hasPermission` to check platform roles
   - Add methods to manage platform roles:
     - `createPlatformRole` - creates role, enforces unique constraint on `(platform_id, type)`
     - `updatePlatformRole` (only for custom roles) - updates role, prevents updating built-in roles
     - `deletePlatformRole` (only for custom roles) - deletes role, validates role is not in use
     - `listPlatformRoles` - lists all platform roles, can filter by types
     - `getPlatformRole` - gets single role by ID
     - `getPlatformRolesByTypes(platformId, roles: string[])` - batch lookup by types
   - Prevent deletion/modification of built-in platform roles

17. **`admin/adapter.ts`** (if exists, or create)
   - Add platform management methods:
     - `findOrCreatePlatform()`
     - `createPlatformRole(data)`
     - `updatePlatformRole(roleId, data)` - with built-in check
     - `deletePlatformRole(roleId)` - with built-in check
     - `listPlatformRoles()`
     - `getPlatformRole(roleId)`
     - `assignPlatformRolesToUser(userId, platformId, roles: string[])` - stores role_type and platform_id
       - **Validation**: Verify all role types exist in `platform_roles` table before assignment
       - **Error**: Return clear error if role type doesn't exist: "Role type 'platform_admin' does not exist"
     - `removePlatformRolesFromUser(userId, roles: string[])`
     - `getUserPlatformRoles(userId)` - returns array of role types (e.g., ["platform_admin"])
     - `getPlatformRolesByTypes(platformId, roles: string[])` - lookup full role details by types (returns full role objects)
   - Update user methods to work with platform roles

18. **`admin/types.ts`** (admin plugin)
   - Remove `role` from user types
   - Add platform role types
   - Update `UserWithRole` → `UserWithPlatformRoles`
   - Add built-in role constants

19. **New file: `admin/zed-schema.ts`** (admin plugin)
   - Define default built-in role permissions in Zed schema format
   - Export permission schemas for platform, organization, team roles
   - Provide utilities to evaluate permissions using Zed schema

20. **New file: `organization/zed-schema.ts`** (organization plugin)
   - Define default built-in role permissions for organizations and teams
   - Export permission schemas
   - Provide utilities to evaluate permissions

### 6. Role Lookup Strategy

#### Getting Role Details:
Since we only store `role_type` in junction tables, full role details are looked up when needed:

**Pattern 1: Basic Display (No Lookup Needed)**
```typescript
// Member listing - just show role types
member.organizationRoles // ["admin", "member"] - direct from junction table
```

**Pattern 2: Full Role Details (Lookup Required)**
```typescript
// When you need role names, descriptions, permissions
const roles = await getRolesByTypes(organizationId, member.organizationRoles)
// Returns: [{ id, type: "admin", name: "Administrator", description: "...", permissions: {...} }]
```

#### Lookup Methods:
- `getOrganizationRolesByTypes(organizationId, roles: string[])` - get full role details
- `getTeamRolesByTypes(teamId, roles: string[])` - get full team role details
- `getPlatformRolesByTypes(platformId, roles: string[])` - get full platform role details

#### Performance Considerations:
- **Index on `role_type`**: Fast filtering of members by role type
- **Index on `resource_id + role_type`**: Fast lookup of role details
- **Caching**: Can cache role details by `resource_id + role_type` since role names/descriptions don't change frequently
- **Batch lookups**: When listing multiple members, batch the role detail lookups

#### Important Notes:
- `role_type` is a unique identifier (like a slug) per resource - derived from role name
- `role_type` should NEVER be updated after creation (it's the canonical identifier)
- If a role type needs to change, create a new role and migrate users
- Role names/descriptions can be updated freely - no junction table updates needed
- Multiple roles can share the same permissions but must have different types
  - Example: "engineering_admin" and "sales_admin" can have identical permissions but different types
- AuthZed handles authorization, so permissions are evaluated separately
- Unique constraints ensure: `UNIQUE(organization_id, type)`, `UNIQUE(team_id, type)`, `UNIQUE(platform_id, type)`

### 7. Migration Strategy

#### Platform Initialization
- On first admin plugin initialization, create singleton platform entity
- Create built-in platform roles with default permissions from Zed schema:
  - `platform_admin` (is_built_in: true)
  - `platform_user` (is_built_in: true)

#### Default Roles Creation
When an organization is created, automatically create built-in roles:
- **Organization built-in roles:**
  - `owner` (type: "owner", is_built_in: true, permissions from Zed schema)
  - `admin` (type: "admin", is_built_in: true, permissions from Zed schema)
  - `member` (type: "member", is_built_in: true, permissions from Zed schema)

- **Team built-in roles:**
  - `lead` (type: "lead", is_built_in: true, permissions from Zed schema)
  - `member` (type: "member", is_built_in: true, permissions from Zed schema)

#### Data Migration
For existing installations:
1. Create platform entity if it doesn't exist
2. Create built-in platform roles
3. Migrate existing `user.role` values to `user_platform_roles` entries (store role_type and platform_id)
4. Create built-in roles for all existing organizations
5. Migrate existing `member.role` values to `member_organization_roles` entries (store role_type and organization_id)
6. Create built-in team roles for all existing teams
7. Remove `role` column from `member`, `invitation`, and `user` tables
8. Remove `platformRoleId` column from `user` table
9. Add indexes on `role_type` and `resource_id + role_type` for performance

### 8. API Changes

#### API Response Format - Role Types as Arrays of Strings

**Important**: All member/user endpoints return role types as simple arrays of strings, NOT nested objects.

**Example Response:**
```typescript
// GET /organization/list-members
{
  members: [
    {
      id: "member-123",
      userId: "user-456",
      organizationId: "org-789",
      organizationRoles: ["admin", "member"], // ✅ Array of strings (role types)
      user: { id: "user-456", name: "John", email: "john@example.com" },
      createdAt: "2024-01-01T00:00:00Z"
    }
  ],
  total: 1
}

// NOT this (nested objects):
{
  members: [
    {
      organizationRoles: [ // ❌ Don't return nested objects - this would conflict with field name!
        { id: "role-1", type: "admin", name: "Admin" },
        { id: "role-2", type: "member", name: "Member" }
      ]
    }
  ]
}
// Note: Field name is `organizationRoles` but it contains an array of role type strings, not role objects
```

**Full role details are available via separate lookup endpoints:**
- `GET /organization/roles/by-types?types=admin,member` - returns full role objects when needed

#### Breaking Changes:
- `POST /organization/add-member`: `role` → `organizationRoles` (array of strings like ["admin", "member"])
- `POST /organization/update-member-role`: → `POST /organization/update-member-roles`, accepts `organizationRoles` array
- `GET /organization/get-active-member-role`: → `GET /organization/get-active-member-roles`, returns `organizationRoles: string[]` (array of role types)
- Full role objects available via: `GET /organization/roles/by-types?types=admin,member`
- `POST /organization/has-permission`: ❌ REMOVED
- `POST /organization/create-role`: ❌ REMOVED (replaced with new endpoints)
- `POST /organization/update-role`: ❌ REMOVED
- `POST /organization/delete-role`: ❌ REMOVED
- `GET /organization/list-roles`: ❌ REMOVED
- `GET /organization/get-role`: ❌ REMOVED

#### New Endpoints (Organization Plugin):
- `POST /organization/roles`: Create a custom role for an organization (cannot create built-in roles)
  - Body: `{ type: string, name: string, description?: string, permissions?: object }`
  - Validates: type is unique, type doesn't conflict with built-in roles
- `PATCH /organization/roles/:id`: Update a custom organization role (cannot update built-in roles)
  - Body: `{ name?: string, description?: string, permissions?: object }`
  - Cannot update `type` or `is_built_in`
- `DELETE /organization/roles/:id`: Delete a custom organization role (cannot delete built-in roles)
  - Validates: role is not in use (check junction tables)
  - Returns error if role is assigned to members
- `GET /organization/roles`: List all roles for an organization (includes built-in and custom)
  - Query params: `?types=admin,member` - filter by types
  - Returns: Array of full role objects
- `GET /organization/roles/:id`: Get a specific organization role
  - Returns: Full role object with id, type, name, description, is_built_in, permissions
- `GET /organization/roles/by-types`: Lookup roles by types (batch lookup)
  - Query params: `?types=admin,member`
  - Returns: Array of full role objects for given types
- `POST /organization/teams/:teamId/roles`: Create a custom role for a team (cannot create built-in roles)
- `PATCH /organization/teams/:teamId/roles/:id`: Update a custom team role (cannot update built-in roles)
- `DELETE /organization/teams/:teamId/roles/:id`: Delete a custom team role (cannot delete built-in roles)
- `GET /organization/teams/:teamId/roles`: List all roles for a team (includes built-in and custom)
- `GET /organization/teams/:teamId/roles/:id`: Get a specific team role
- `GET /organization/teams/:teamId/roles/by-types`: Lookup team roles by types

#### Admin Plugin API Changes:

**Breaking Changes:**
- `POST /admin/set-role`: → `POST /admin/set-platform-roles`, accepts `platformRoles` array (e.g., ["platform_admin"])
- `POST /admin/create-user`: `role` → `platformRoles` (array of strings)
- `POST /admin/update-user`: Remove `role` field, use `platformRoles` array

**New Endpoints (Admin Plugin):**
- `POST /admin/platform/roles`: Create a custom platform role (cannot create built-in roles)
  - Body: `{ type: string, name: string, description?: string, permissions?: object }`
- `PATCH /admin/platform/roles/:id`: Update a custom platform role (cannot update built-in roles)
  - Body: `{ name?: string, description?: string, permissions?: object }`
- `DELETE /admin/platform/roles/:id`: Delete a custom platform role (cannot delete built-in roles)
  - Validates: role is not in use (check junction tables)
- `GET /admin/platform/roles`: List all platform roles (includes built-in and custom)
  - Query params: `?types=platform_admin,platform_user` - filter by types
- `GET /admin/platform/roles/:id`: Get a specific platform role
- `GET /admin/platform/roles/by-types`: Lookup platform roles by types
  - Query params: `?types=platform_admin,platform_user`
- `GET /admin/users/:userId/platform-roles`: Get platform roles for a user
  - Returns: `{ platformRoles: string[] }` (array of role types, not full objects)

### 9. Type System Updates

- Remove all conditional types based on `teams.enabled`
- Remove all conditional types based on `dynamicAccessControl.enabled`
- Update `InferMember` to include `organizationRoles: string[]` (e.g., ["admin", "member"]) - from junction table
  - **Important**: Returns role types as simple array of strings, NOT nested role objects
  - Example: `{ id: "...", organizationRoles: ["admin", "member"] }`
  - Full role details available via lookup endpoint: `GET /organization/roles/by-types?types=admin,member`
- Update `InferTeamMember` to include `teamRoles: string[]` - from junction table
  - **Important**: Returns role types as simple array of strings, NOT nested role objects
  - Example: `{ id: "...", teamRoles: ["lead", "member"] }`
- Update admin plugin user types to include `platformRoles: string[]` - from junction table
  - **Important**: Returns role types as simple array of strings, NOT nested role objects
  - Example: `{ id: "...", platformRoles: ["platform_admin"] }`
- Update `InferInvitation` to include `organizationRoles: string[]` and `teamRoles: string[]`
  - **Note**: Invitations store role types (strings), not role IDs
- Remove `InferOrganizationRolesFromOption` (no longer needed)
- Add `InferOrganizationRole` with `is_built_in` and `permissions` fields
- Add `InferTeamRole` with `is_built_in` and `permissions` fields
- Add `InferPlatformRole` with `is_built_in` and `permissions` fields
- Update admin plugin user types to include `platformRoles: PlatformRole[]`
- Add Zed schema permission types

### 10. Testing Updates

- Update all tests to use role arrays instead of single role
- Remove access control permission tests
- Add tests for role management endpoints
- Add tests for multiple roles per user
- Update team tests (teams are now always enabled)
- Add tests for built-in role protection (cannot delete/modify)
- Add tests for custom role creation
- Add tests for platform role management
- Add tests for Zed schema permission evaluation
- Add tests for admin plugin with platform roles
- Add tests for role type storage in junction tables
- Add tests for role detail lookups using resource_id + role_type
- Add tests for member/user queries returning role types without joins
- Add tests for batch role detail lookups
- Add tests for index performance on role_type

## Implementation Order

1. **Phase 1: Platform & Built-in Roles Foundation**
   - Create platform entity schema
   - Create platform roles schema with built-in support
   - Create Zed schema definitions for built-in role permissions
   - Update admin plugin schema
   - Add platform initialization logic

2. **Phase 2: Organization Schema & Types**
   - Update organization plugin schema definitions
   - Add built-in role support to organization and team roles
   - Update TypeScript types
   - Update schema building in `organization.ts`
   - Add Zed schema integration

3. **Phase 3: Adapter Layer**
   - Add platform management methods
   - Add platform role management methods (with built-in protection)
   - Add organization/team role management methods (with built-in protection)
   - Update existing member methods
   - Remove role field handling
   - Add junction table methods

4. **Phase 4: Routes - Admin Plugin**
   - Update admin plugin endpoints to use platform roles
   - Add platform role management endpoints
   - Update permission checks
   - Remove `user.role` field usage

5. **Phase 5: Routes - Organization Plugin**
   - Update member routes
   - Update invitation routes
   - Update organization creation (with built-in role creation)
   - Add role management endpoints (with built-in protection)
   - Remove access control routes

6. **Phase 6: Zed Schema Permission System**
   - Implement Zed schema permission evaluation
   - Add permission checking utilities
   - Integrate with role management

7. **Phase 7: Cleanup**
   - Remove access control files
   - Update client libraries
   - Update middleware
   - Update tests

8. **Phase 8: Documentation**
   - Update API documentation
   - Update migration guide
   - Update examples
   - Document built-in roles and permissions
   - Document Zed schema format

## Benefits

1. **Simplified Codebase**: Removes complex access control logic
2. **More Flexible**: Multiple roles per user allows for complex permission scenarios
3. **Customizable**: Roles are per-organization/team/platform, allowing customization
4. **Protected System Roles**: Built-in roles cannot be accidentally deleted or modified
5. **Zed Schema Integration**: Standardized permission format using Zed schema
6. **Platform-Level Admin Control**: Platform roles provide clear separation for admin access
7. **Cleaner API**: More intuitive role management
8. **Better Scalability**: Junction tables allow efficient querying of roles
9. **Better UX**: Role types immediately visible without joins
10. **Query Performance**: Indexed role_type allows fast queries and filtering
11. **Developer Experience**: Simple junction tables, lookup full details only when needed
12. **No Sync Overhead**: Role names can be updated without touching junction tables
13. **Cleaner Data Model**: Single source of truth for role details in role tables

## Considerations

1. **Breaking Changes**: This is a major breaking change - will require migration guide
2. **Performance**: Junction tables add complexity but allow for efficient queries
3. **Built-in Roles**: Need to ensure built-in roles are created on org/team/platform creation
4. **Zed Schema**: Need to document Zed schema format for permissions
5. **Platform Singleton**: Platform entity must be managed as singleton
6. **Backward Compatibility**: None - this is a complete refactor
7. **Permission Evaluation**: Need efficient Zed schema evaluation for permission checks
8. **Role Protection**: Must enforce built-in role protection at all levels (API, adapter, database constraints)
9. **Unique Constraints**: Must enforce `UNIQUE(organization_id, type)`, `UNIQUE(team_id, type)`, `UNIQUE(platform_id, type)` at database level
10. **Role Validation**: Must validate role types exist before assignment (in adapter and API layers)
11. **Role Deletion**: Must prevent deletion of roles that are in use (check junction tables before deletion)
12. **Team Role Scope**: Team roles are scoped to team, not organization - document this clearly
13. **API Response Format**: Member/user listings return role types as `string[]`, NOT nested role objects
    - Example: `{ organizationRoles: ["admin", "member"] }` ✅ (array of role type strings)
    - NOT: `{ organizationRoles: [{ id, type, name }] }` ❌ (nested objects)
    - Note: Field name is `organizationRoles` but contains array of role type strings, not role objects
    - Full role objects available via separate lookup endpoints
14. **Invitation Schema**: Invitations store `organizationRoles` and `teamRoles` (arrays of strings), not IDs

## Key Design Decisions Summary

### Role Type as Unique Identifier
- Role `type` is a unique identifier (like a slug) per resource
- Derived from role name: "Engineering Admin" → `"engineering_admin"`
- Enforced by unique constraints: `UNIQUE(organization_id, type)`, `UNIQUE(team_id, type)`, `UNIQUE(platform_id, type)`
- Multiple roles can share permissions but must have different types

### Junction Table Design
- Store only `role_type` (string) and `resource_id` in junction tables
- No foreign keys to role tables - roles identified by `resource_id + role_type`
- Fast queries with index on `role_type`
- Full role details available via lookup when needed

### API Response Format
- **Member/user listings return role types as `string[]`, NOT nested role objects**
- Example: `{ organizationRoles: ["admin", "member"] }` ✅ (array of role type strings)
- NOT: `{ organizationRoles: [{ id, type, name }] }` ❌ (nested objects)
- Note: Field name is `organizationRoles` but contains array of role type strings, not role objects
- Full role objects available via separate lookup endpoints when needed
- This keeps API responses simple and lightweight - users get role types directly
- Full role details (name, description, permissions) available via lookup endpoints if needed
- Not full role objects - reduces payload size and complexity
- Full role details available via dedicated lookup endpoints if needed

### Invitation Schema
- Invitations store `organizationRoles` and `teamRoles` (arrays of strings)
- Not role IDs - allows invitations to work even if roles are recreated
- Validation ensures role types exist before accepting invitation

### Team Role Scope
- Team roles are scoped to the team, not the organization
- Same role type can exist in different teams
- Unique constraint: `UNIQUE(team_id, type)` (not organization_id)

### Built-in Role Protection
- Built-in roles use reserved types: "owner", "admin", "member" (org), "lead", "member" (team), "platform_admin", "platform_user"
- Cannot be deleted or modified
- Created first, preventing custom roles from using same types (enforced by unique constraint)

