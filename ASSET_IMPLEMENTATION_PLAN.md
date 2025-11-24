# Asset Plugin Implementation Plan

## Overview
This document outlines the implementation of a new **Asset Plugin** for Better Auth. Assets are objects that can have granular access control, owned by users within organizations. Asset roles are scoped to asset types (not individual assets) to prevent role explosion.

**Important:** This will be a **separate plugin** (`assets`), not part of the organization plugin. It will integrate with the organization plugin when both are enabled.

## Design Principles

1. **Separate Plugin**: Assets will be a standalone plugin that can work independently or with the organization plugin
2. **Asset Types First**: Asset roles are defined at the asset type level, not per-asset
3. **Horizontal Extension**: All changes are additive and don't affect existing schemas
4. **Consistent Patterns**: Follow the same patterns as `organizationRole` and `teamRole` from the organization plugin
5. **Flexible Scoping**: Asset types can be organization-scoped or global
6. **App Contributions**: Default asset types can be contributed by specific apps
7. **Optional Organization Integration**: Works with organization plugin when enabled, but can function independently

## Database Schema Changes

### New Tables

#### 1. `assetType`
Asset type definitions. Can be organization-scoped or global.

**Fields:**
- `id` (string, primary key)
- `organizationId` (string, optional, indexed, FK to organization) - NULL for global/platform types
- `scope` (string, required, default: "organization") - "organization" | "global"
  - `"organization"`: Private to the creating organization
  - `"global"`: Available to all organizations (platform-level)
- `name` (string, required) - e.g., "Project", "Resource", "Document"
- `description` (string, optional)
- `metadata` (json/string, optional) - Additional type-specific metadata
- `source` (string, optional) - App identifier for default types (e.g., "app:project-manager")
- `isBuiltIn` (boolean, default: false) - Whether this is a built-in type
- `createdAt` (date, required)
- `updatedAt` (date, optional)

**Indexes:**
- `organizationId` + `name` (unique, partial) - Unique names per org (when org-scoped)
- `scope` + `name` (unique, partial) - Unique names for global types
- `scope` (indexed) - For filtering by scope

**Constraints:**
- If `scope = "global"`, `organizationId` MUST be NULL
- If `scope = "organization"`, `organizationId` MUST be NOT NULL

**Note:** Future sharing of asset types with specific users, organizations, teams, agents, etc. will be handled by a generic sharing system.

#### 2. `asset`
Individual asset instances.

**Fields:**
- `id` (string, primary key)
- `organizationId` (string, optional, indexed, FK to organization) - Owning organization (optional if org plugin not enabled)
- `ownerId` (string, required, indexed, FK to user) - Asset owner
- `assetTypeId` (string, required, indexed, FK to assetType)
- `teamId` (string, optional, indexed, FK to team) - Optional team association (requires org plugin)
- `name` (string, required) - Asset name
- `metadata` (json/string, optional) - Asset-specific metadata
- `createdAt` (date, required)
- `updatedAt` (date, optional)

**Indexes:**
- `organizationId` (indexed, optional)
- `ownerId` (indexed)
- `assetTypeId` (indexed)
- `teamId` (indexed, optional)

**Constraints:**
- `organizationId` is optional - can be null if organization plugin is not enabled
- `teamId` requires `organizationId` to be set (if organization plugin is enabled)

**Note:** Asset sharing with users, organizations, teams, agents, etc. will be implemented in a future generic sharing system.

#### 3. `assetRole`
Role definitions for asset types (NOT per-asset).

**Fields:**
- `id` (string, primary key)
- `assetTypeId` (string, required, indexed, FK to assetType)
- `type` (string, required, indexed) - Role type identifier (e.g., "manager", "editor", "viewer")
- `name` (string, required) - Human-readable role name
- `description` (string, optional)
- `isBuiltIn` (boolean, default: false)
- `permissions` (json, optional) - Role permissions
- `createdAt` (date, required)
- `updatedAt` (date, optional)

**Indexes:**
- `assetTypeId` + `type` (unique) - Ensure unique role types per asset type

#### 4. `memberAssetRole`
Junction table for assigning asset roles to members on specific assets.

**Fields:**
- `id` (string, primary key)
- `memberId` (string, optional, indexed, FK to member) - Optional if org plugin not enabled
- `userId` (string, optional, indexed, FK to user) - Direct user assignment (when org plugin not enabled)
- `assetId` (string, required, indexed, FK to asset)
- `role` (string, required, indexed) - Role type (references assetRole.type)
- `createdAt` (date, required)

**Indexes:**
- `memberId` (indexed, optional)
- `userId` (indexed, optional)
- `assetId` (indexed)
- `role` (indexed)
- `assetId` + `memberId` + `role` (unique, partial) - Prevent duplicate role assignments
- `assetId` + `userId` + `role` (unique, partial) - Prevent duplicate role assignments

**Constraints:**
- Either `memberId` OR `userId` must be set (not both)
- `memberId` requires organization plugin to be enabled
- `userId` can be used when organization plugin is not enabled

**Note:** Asset type and asset sharing will be implemented via a future generic sharing system that can share with users, organizations, teams, agents, etc. For now, asset types use scope-based access (organization/global).

#### 5. `assetShare`
Sharing grants that connect an asset to a grantee (member, team, organization, or external email) with a specific role.

**Fields:**
- `id` (string, primary key)
- `assetId` (string, required, indexed, FK to `asset`)
- `grantType` (string, required) - `"member" | "team" | "organization" | "external_email"`
- `memberId` (string, optional, indexed, FK to `member`) - required when `grantType = "member"`
- `teamId` (string, optional, indexed, FK to `team`) - required when `grantType = "team"`
- `organizationId` (string, optional, indexed, FK to `organization`) - required when `grantType = "organization"`
- `externalEmail` (string, optional, indexed) - required when `grantType = "external_email"`
- `role` (string, required, indexed) - Asset role type
- `status` (string, required, default: `"pending"`) - `"pending" | "active" | "revoked" | "expired"`
- `invitedByMemberId` (string, optional, FK to `member`)
- `expiresAt` (date, optional)
- `createdAt` (date, required)
- `updatedAt` (date, optional)

**Indexes:**
- `assetId`
- `status`
- Composite indexes on (`assetId`, `grantType`, `memberId|teamId|organizationId|externalEmail`)

#### 6. `assetShareLink`
Stores link-based shares (e.g., “anyone with the link can view”).

**Fields:**
- `id` (string, primary key)
- `assetId` (string, required, indexed, FK to `asset`)
- `tokenHash` (string, required, unique)
- `role` (string, required)
- `linkVisibility` (string, required, default: `"organization"`) - `"organization" | "anyone"`
- `requiresAuth` (boolean, required, default: true)
- `passwordHash` (string, optional)
- `expiresAt` (date, optional)
- `createdByMemberId` (string, required, FK to `member`)
- `revokedAt` (date, optional)
- `createdAt` (date, required)

**Indexes:**
- `assetId`
- `tokenHash` (unique)
- `linkVisibility`

### Asset + Asset Type Visibility Fields

- `assetType.allowedVisibilities`: JSON array of permissible visibilities for the type.
- `assetType.defaultVisibility`: Default applied to new assets (must be in allowed list).
- `asset.visibility`: Concrete visibility per asset (`"private" | "internal" | "public"`).
- `asset.visibilityLocked`: Optional boolean flag to block non-admin changes.

Rules:
- `assetType.defaultVisibility` must exist in `allowedVisibilities`.
- `asset.visibility` must exist in the parent type’s allowed list.
- `internal`/`public` visibilities require `asset.organizationId` to be non-null.

## Plugin Structure

### New Plugin Location
```
packages/better-auth/src/plugins/assets/
├── index.ts              # Main plugin export
├── assets.ts             # Plugin definition and setup
├── schema.ts             # Schema definitions
├── types.ts              # TypeScript types and options
├── adapter.ts            # Adapter methods
├── client.ts             # Client-side types
├── error-codes.ts        # Error code constants
├── routes/
│   └── crud-assets.ts    # API endpoints
└── assets.test.ts         # Tests
```

### Plugin Integration

The assets plugin will:
- Work independently (assets can exist without organizations)
- Integrate with organization plugin when both are enabled
- Reference organization/team tables via foreign keys when available
- Follow the same plugin pattern as `organization`, `graph`, etc.

## TypeScript Schema Changes

### File: `packages/better-auth/src/plugins/assets/schema.ts`

#### New Interfaces

```typescript
interface AssetTypeDefaultFields {
  organizationId: { type: "string"; required: false; references: { model: "organization"; field: "id" }; index: true; };
  scope: { type: "string"; required: true; defaultValue: "organization"; };
  name: { type: "string"; required: true; };
  description: { type: "string"; required: false; };
  metadata: { type: "json"; required: false; };
  source: { type: "string"; required: false; };
  isBuiltIn: { type: "boolean"; required: true; defaultValue: false; };
  createdAt: { type: "date"; required: true; defaultValue: Date; };
  updatedAt: { type: "date"; required: false; };
}

interface AssetDefaultFields {
  organizationId: { type: "string"; required: false; references: { model: "organization"; field: "id" }; index: true; };
  ownerId: { type: "string"; required: true; references: { model: "user"; field: "id" }; index: true; };
  assetTypeId: { type: "string"; required: true; references: { model: "assetType"; field: "id" }; index: true; };
  teamId: { type: "string"; required: false; references: { model: "team"; field: "id" }; index: true; };
  name: { type: "string"; required: true; };
  metadata: { type: "json"; required: false; };
  createdAt: { type: "date"; required: true; defaultValue: Date; };
  updatedAt: { type: "date"; required: false; };
}

interface MemberAssetRoleDefaultFields {
  memberId: { type: "string"; required: false; references: { model: "member"; field: "id" }; index: true; };
  userId: { type: "string"; required: false; references: { model: "user"; field: "id" }; index: true; };
  assetId: { type: "string"; required: true; references: { model: "asset"; field: "id" }; index: true; };
  role: { type: "string"; required: true; index: true; };
  createdAt: { type: "date"; required: true; defaultValue: Date; };
}

interface AssetRoleDefaultFields {
  assetTypeId: { type: "string"; required: true; references: { model: "assetType"; field: "id" }; index: true; };
  type: { type: "string"; required: true; index: true; };
  name: { type: "string"; required: true; };
  description: { type: "string"; required: false; };
  isBuiltIn: { type: "boolean"; required: true; defaultValue: false; };
  permissions: { type: "json"; required: false; };
  createdAt: { type: "date"; required: true; defaultValue: Date; };
  updatedAt: { type: "date"; required: false; };
}

interface MemberAssetRoleDefaultFields {
  memberId: { type: "string"; required: false; references: { model: "member"; field: "id" }; index: true; };
  userId: { type: "string"; required: false; references: { model: "user"; field: "id" }; index: true; };
  assetId: { type: "string"; required: true; references: { model: "asset"; field: "id" }; index: true; };
  role: { type: "string"; required: true; index: true; };
  createdAt: { type: "date"; required: true; defaultValue: Date; };
}
```

#### New Zod Schemas

```typescript
export const assetTypeSchema = z.object({
  id: z.string().default(generateId),
  organizationId: z.string().nullable().optional(),
  scope: z.enum(["organization", "global"]).default("organization"),
  name: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  source: z.string().optional(),
  isBuiltIn: z.boolean().default(false),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().optional(),
}).refine(
  (data) => {
    // If scope is "organization", organizationId must be set
    if (data.scope === "organization" && !data.organizationId) {
      return false;
    }
    // If scope is "global", organizationId must be null
    if (data.scope === "global" && data.organizationId !== null) {
      return false;
    }
    return true;
  },
  {
    message: "organizationId must be set for organization-scoped types, and null for global types",
  }
);

export const assetSchema = z.object({
  id: z.string().default(generateId),
  organizationId: z.string().optional(),
  ownerId: z.string(),
  assetTypeId: z.string(),
  teamId: z.string().optional(),
  name: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().optional(),
});

export const memberAssetRoleSchema = z.object({
  id: z.string().default(generateId),
  memberId: z.string().optional(),
  userId: z.string().optional(),
  assetId: z.string(),
  role: z.string(),
  createdAt: z.date().default(() => new Date()),
}).refine(
  (data) => {
    // Either memberId or userId must be set, but not both
    return (data.memberId !== undefined) !== (data.userId !== undefined);
  },
  {
    message: "Either memberId or userId must be set, but not both",
  }
);

export const assetRoleSchema = z.object({
  id: z.string().default(generateId),
  assetTypeId: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isBuiltIn: z.boolean().default(false),
  permissions: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().optional(),
});

export const memberAssetRoleSchema = z.object({
  id: z.string().default(generateId),
  memberId: z.string(),
  assetId: z.string(),
  role: z.string(),
  createdAt: z.date().default(() => new Date()),
});
```

#### Update OrganizationSchema Type

Add to `OrganizationSchema<O>`:
- `assetType: InferSchema<..., "assetType", AssetTypeDefaultFields>`
- `asset: InferSchema<..., "asset", AssetDefaultFields>`
- `assetRole: InferSchema<..., "assetRole", AssetRoleDefaultFields>`
- `memberAssetRole: InferSchema<..., "memberAssetRole", MemberAssetRoleDefaultFields>`

## Adapter Methods

### File: `packages/better-auth/src/plugins/assets/adapter.ts`

Add new methods to `getOrgAdapter`:

#### Asset Type Methods
- `createAssetType(data)`: Create a new asset type (org-scoped or global)
- `findAssetTypeById(id)`: Find asset type by ID
- `findAssetTypeByName(organizationId, name, scope?)`: Find asset type by name
- `listAssetTypes(organizationId, options?)`: List asset types available to an organization
  - Includes: org-scoped types for that org and all global types
- `listGlobalAssetTypes()`: List all global asset types
- `updateAssetType(id, data)`: Update asset type
- `deleteAssetType(id)`: Delete asset type (with validation)

#### Asset Methods
- `createAsset(data)`: Create a new asset
- `findAssetById(id)`: Find asset by ID
- `listAssets(organizationId, options?)`: List assets owned by an organization
- `updateAsset(id, data)`: Update asset
- `deleteAsset(id)`: Delete asset (cascade delete role assignments)

**Note:** Asset sharing with users, organizations, teams, agents, etc. will be implemented via a future generic sharing system.

#### Asset Role Methods
- `createAssetRole(data)`: Create a new asset role for an asset type
- `getAssetRolesByAssetType(assetTypeId)`: Get all roles for an asset type
- `getAssetRolesByTypes(assetTypeId, types[])`: Get specific roles by types
- `updateAssetRole(id, data)`: Update asset role
- `deleteAssetRole(id)`: Delete asset role (with validation)

#### Member Asset Role Methods
- `assignAssetRolesToMember(memberId, assetId, roles[])`: Assign roles to member on asset
- `removeAssetRolesFromMember(memberId, assetId, roles[])`: Remove roles from member
- `getMemberAssetRoles(memberId, assetId?)`: Get roles for member (optionally filtered by asset)
- `getAssetMembers(assetId)`: Get all members with roles on an asset

## API Endpoints

### File: `packages/better-auth/src/plugins/assets/routes/crud-assets.ts`

#### Asset Type Endpoints
- `POST /organization/create-asset-type`: Create asset type (org-scoped or global)
- `GET /organization/list-asset-types`: List asset types available to organization (org-scoped + global)
- `GET /organization/list-global-asset-types`: List all global asset types
- `POST /organization/update-asset-type`: Update asset type
- `POST /organization/delete-asset-type`: Delete asset type

#### Asset Endpoints
- `POST /organization/create-asset`: Create asset
- `GET /organization/list-assets`: List assets owned by organization
- `POST /organization/update-asset`: Update asset
- `POST /organization/delete-asset`: Delete asset
- `GET /organization/get-asset`: Get asset by ID

**Note:** Asset sharing endpoints will be added when the generic sharing system is implemented.

#### Asset Role Endpoints
- `POST /organization/create-asset-role`: Create asset role for an asset type
- `GET /organization/list-asset-roles`: List roles for an asset type
- `POST /organization/update-asset-role`: Update asset role
- `POST /organization/delete-asset-role`: Delete asset role

#### Member Asset Role Endpoints
- `POST /organization/assign-asset-roles`: Assign roles to member on asset
- `POST /organization/remove-asset-roles`: Remove roles from member
- `GET /organization/get-asset-members`: Get members with roles on asset
- `GET /organization/get-member-asset-roles`: Get roles for member on assets

## Plugin Definition

### File: `packages/better-auth/src/plugins/assets/assets.ts`

1. **Plugin Structure**:
   ```typescript
   export type AssetPlugin<O extends AssetOptions> = {
     id: "assets";
     endpoints: AssetEndpoints<O>;
     schema: AssetSchema<O>;
     $Infer: {
       Asset: InferAsset<O>;
       AssetType: InferAssetType<O>;
       AssetRole: InferAssetRole<O>;
     };
     $ERROR_CODES: typeof ASSET_ERROR_CODES;
     options: O;
   };
   ```

2. **Plugin Function**:
   ```typescript
   export function assets<O extends AssetOptions>(
     options?: O | undefined,
   ): AssetPlugin<O>
   ```

3. **Integration with Organization Plugin**:
   - When organization plugin is enabled, assets can reference organizations/teams
   - When organization plugin is NOT enabled, `organizationId` and `teamId` can be optional or null
   - Check for organization plugin presence at runtime

## Type Definitions

### File: `packages/better-auth/src/plugins/assets/types.ts`

```typescript
export interface AssetOptions {
  /**
   * Default asset types to create when plugin is initialized
   */
  defaultAssetTypes?: {
    name: string;
    description: string;
    scope?: "organization" | "global";
    source?: string; // App identifier
    builtInRoles?: {
      type: string;
      name: string;
      description: string;
      permissions?: Record<string, any>;
    }[];
  }[];



  /**
   * Schema customization
   */
  schema?: {
    assetType?: {
      modelName?: string;
      fields?: { [key: string]: string };
      additionalFields?: { [key: string]: DBFieldAttribute };
    };
    asset?: {
      modelName?: string;
      fields?: { [key: string]: string };
      additionalFields?: { [key: string]: DBFieldAttribute };
    };
    assetRole?: {
      modelName?: string;
      fields?: { [key: string]: string };
      additionalFields?: { [key: string]: DBFieldAttribute };
    };
    memberAssetRole?: {
      modelName?: string;
      fields?: { [key: string]: string };
      additionalFields?: { [key: string]: DBFieldAttribute };
    };
  };
}
```

## Built-in Asset Types

When the assets plugin is initialized, optionally create default asset types:
- Similar to how built-in organization roles are created in the organization plugin
- Can be contributed by apps via the `source` field
- Built-in roles are created per asset type
- Can be organization-scoped or global

## Graph Integration

If graph is enabled, add relationships:
- `asset` -> `organization` (organization relation - owning org)
- `asset` -> `user` (owner relation)
- `asset` -> `team` (team relation, optional)
- `asset` -> `assetType` (assetType relation)
- `assetRole` -> `assetType` (assetType relation)
- `asset_role` -> `asset` (roles relation)
- `user` -> `asset_role` (has_role relation)
- `assetType` -> `organization` (organization relation - owner, nullable for global)

**Note:** Sharing relationships will be added when the generic sharing system is implemented.

## Testing

### New Test Files
- `asset.test.ts`: Test asset CRUD operations
- `asset-role.test.ts`: Test asset role management
- `asset-hook.test.ts`: Test asset hooks (if added)

### Test Coverage
- Asset type creation, update, deletion
- Asset creation with asset type
- Asset role creation and assignment
- Member role assignment on assets
- Permission checks
- Cascade deletions
- Built-in asset types and roles

## Migration Considerations

1. **Backward Compatibility**: All changes are additive - existing schemas unaffected
2. **Optional Plugin**: Assets plugin is opt-in - must be added to plugins array
3. **No Breaking Changes**: Existing plugins (organization, team, etc.) remain unchanged
4. **Independent Operation**: Assets plugin can work without organization plugin
5. **Integration**: When both plugins are enabled, they integrate seamlessly

## Asset Type Scoping Summary

### Two-Tier Model

1. **Organization-Scoped** (`scope: "organization"`)
   - Private to creating organization
   - `organizationId`: required
   - Use case: Custom asset types specific to one org

2. **Global** (`scope: "global"`)
   - Available to ALL organizations
   - `organizationId`: NULL
   - Use case: Standard asset types (Project, Document, etc.)
   - Similar to platform-level products

**Querying Asset Types:**
When listing asset types for an organization, include:
- All organization-scoped types for that org (`scope = "organization"` AND `organizationId = orgId`)
- All global types (`scope = "global"`)

### Future Sharing System

A generic sharing system will be implemented separately to handle:
- Sharing assets and asset types with users, organizations, teams, agents, etc.
- Flexible permission models
- Role-based sharing
- Audit trails

## Implementation Order

1. **Phase 1: Plugin Structure**
   - Create `packages/better-auth/src/plugins/assets/` directory
   - Set up basic plugin structure (`index.ts`, `assets.ts`)
   - Define plugin types and exports

2. **Phase 2: Schema & Types**
   - Create `schema.ts` with all schema definitions
   - Create `types.ts` with `AssetOptions` interface
   - Create `error-codes.ts` with error constants
   - Define TypeScript types for all entities

3. **Phase 3: Adapter Methods**
   - Create `adapter.ts`
   - Implement all adapter methods
   - Follow existing patterns from organization plugin
   - Handle optional organization plugin integration

4. **Phase 4: API Endpoints**
   - Create `routes/crud-assets.ts`
   - Implement all CRUD endpoints
   - Add validation and error handling
   - Handle organization plugin integration checks

5. **Phase 5: Plugin Definition**
   - Complete `assets.ts` plugin function
   - Wire up schema, endpoints, and types
   - Export plugin properly

6. **Phase 6: Client Types**
   - Create `client.ts` for client-side types
   - Follow pattern from organization plugin client

7. **Phase 7: Graph Integration**
   - Add graph relationships (if graph plugin enabled)
   - Update graph schema definitions

8. **Phase 8: Testing**
   - Create `assets.test.ts`
   - Write comprehensive tests
   - Test with and without organization plugin
   - Test edge cases and permission checks

9. **Phase 9: Documentation**
   - Add plugin to main exports
   - Update API documentation
   - Add usage examples
   - Document integration with organization plugin

## Key Design Decisions

1. **Asset Roles Scoped to Types**: Prevents role explosion - one role definition per asset type, not per asset
2. **Asset Type Scoping**: 
   - **Organization-scoped**: Private to creating organization
   - **Global**: Available to all organizations (platform-level, like products)
3. **Future Generic Sharing**: Asset and asset type sharing will be implemented via a generic sharing system that can share with:
   - Specific users (with roles)
   - Organizations
   - Teams
   - Agents
   - Other entities as needed
4. **Source Field**: Allows apps to contribute default asset types while still allowing org customization
5. **Optional Team Association**: Assets can optionally belong to teams for hierarchical access
6. **Junction Table Pattern**: Follows same pattern as `memberOrganizationRole` and `memberTeamRole`

## Asset Type Scoping

### Two Scopes

1. **Organization** (`scope = "organization"`):
   - Private to the creating organization
   - `organizationId` is required
   - Not visible to other organizations
   - Use case: Custom asset types specific to one org

2. **Global** (`scope = "global"`):
   - Available to all organizations on the platform
   - `organizationId` is NULL
   - Similar to how products work at platform level
   - Useful for standard asset types (e.g., "Project", "Document")
   - Can be created by platform admins or apps

### Future Sharing

Asset and asset type sharing will be implemented via a generic sharing system that supports:
- Sharing with specific users (with role-based access)
- Sharing with organizations
- Sharing with teams
- Sharing with agents
- Flexible permission models
- Audit trails for sharing actions

This will be implemented as a separate feature to maintain flexibility and avoid premature optimization.

## Plugin Usage Example

```typescript
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { assets } from "better-auth/plugins/assets";

const auth = betterAuth({
  plugins: [
    organization({
      // organization options
    }),
    assets({
      requireOrganization: true, // Require org plugin
      defaultAssetTypes: [
        {
          name: "Project",
          scope: "global",
          builtInRoles: [
            { type: "manager", name: "Manager", description: "..." },
            { type: "editor", name: "Editor", description: "..." },
            { type: "viewer", name: "Viewer", description: "..." },
          ],
        },
      ],
    }),
  ],
});
```

## Open Questions

1. ~~Should asset types be shareable across organizations?~~ ✅ **Yes - via global scope for now, generic sharing system later**
2. ~~Should there be a global asset type registry?~~ ✅ **Yes - via scope = "global"**
3. Should asset deletion cascade to role assignments? ✅ **Yes, via junction table**
4. Should asset type deletion be restricted if assets exist? ✅ **Yes, similar to organization role deletion**
5. Should global asset types be modifiable by any org or only platform admins? **Recommendation: Only platform admins or the creating org**
6. What will the generic sharing system look like? **To be designed - will support users, orgs, teams, agents, etc.**
7. Should assets work without organization plugin? ✅ **Yes - with optional organizationId**
8. How to handle memberAssetRole when org plugin is not enabled? ✅ **Use userId directly instead of memberId**

