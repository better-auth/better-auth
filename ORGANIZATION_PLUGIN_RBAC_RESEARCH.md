# Better Auth Organization Plugin - RBAC Research Document

## Executive Summary

The organization plugin implements a flexible Role-Based Access Control (RBAC) system. Currently:
- **Resources (statements)** are STATIC and defined at compile-time via `createAccessControl(statements)`
- **Roles** can be DYNAMIC when `dynamicAccessControl.enabled = true`
- **Permissions** (actions within resources) are STATIC and defined in the statements

Your goal is to make **resources and permissions also customizable per organization**, similar to how roles are currently customizable.

---

## 1. Core Access Control System

### 1.1 Location
- Core implementation: `packages/better-auth/src/plugins/access/`
  - `access.ts` - Main logic
  - `types.ts` - Type definitions
  - `index.ts` - Exports

### 1.2 Key Concepts

#### **Statements** (Resources + Permissions)
A statement defines what resources exist and what actions (permissions) are available for each resource:

```typescript
const statements = {
  organization: ["update", "delete"],      // Resource: organization, Permissions: update, delete
  member: ["create", "update", "delete"],  // Resource: member, Permissions: create, update, delete
  invitation: ["create", "cancel"],        // Resource: invitation, Permissions: create, cancel
  team: ["create", "update", "delete"],    // Resource: team, Permissions: create, update, delete
  ac: ["create", "read", "update", "delete"], // Resource: ac (access control), Permissions: CRUD
} as const;
```

**Important**: These statements are STATIC and defined once at the application level.

#### **Access Control Instance**
Created via `createAccessControl(statements)`:
- Returns an object with `newRole()` method
- Stores the statements as `statements` property
- The statements define the "universe" of possible resources and permissions

```typescript
export function createAccessControl<const TStatements extends Statements>(s: TStatements) {
  return {
    newRole<K extends keyof TStatements>(statements: Subset<K, TStatements>) {
      return role<Subset<K, TStatements>>(statements);
    },
    statements: s,
  };
}
```

#### **Roles**
A role is a subset of the available statements, specifying which permissions a role has:

```typescript
const adminRole = ac.newRole({
  organization: ["update"],                // Can only update, not delete
  member: ["create", "update", "delete"],  // Full CRUD on members
  invitation: ["create", "cancel"],        // Full access to invitations
  team: ["create", "update", "delete"],    // Full CRUD on teams
  ac: ["create", "read", "update", "delete"], // Full CRUD on access control
});
```

#### **Authorization**
The `authorize()` method checks if a role has specific permissions:

```typescript
role.authorize({
  member: ["create"],      // Check if role can create members
  organization: ["update"] // AND can update organization
}); // Returns { success: true/false, error?: string }
```

**How it works:**
1. For each requested resource, check if the role has that resource
2. For each requested permission in that resource, check if it's in the role's allowed permissions
3. Uses "AND" logic by default (all permissions must be present)
4. Can use "OR" logic for flexible checks

---

## 2. Organization Plugin Architecture

### 2.1 File Structure
```
packages/better-auth/src/plugins/organization/
├── index.ts                    # Main export
├── organization.ts             # Plugin definition, ~1255 lines
├── types.ts                    # OrganizationOptions interface
├── schema.ts                   # Database schemas, zod validators
├── has-permission.ts           # Permission checking logic
├── permission.ts               # Permission utilities
├── adapter.ts                  # Database adapter wrapper
├── call.ts                     # Middleware definitions
├── access/
│   ├── index.ts               # Re-exports
│   └── statement.ts           # Default statements and roles
└── routes/
    ├── crud-access-control.ts # Dynamic role CRUD endpoints (~1227 lines)
    ├── crud-org.ts            # Organization CRUD
    ├── crud-members.ts        # Member CRUD
    ├── crud-invites.ts        # Invitation CRUD
    └── crud-team.ts           # Team CRUD
```

### 2.2 Default Configuration

#### Default Statements (Resources + Permissions)
From `access/statement.ts`:

```typescript
export const defaultStatements = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],  // Access Control management
} as const;
```

#### Default Roles
```typescript
export const adminAc = defaultAc.newRole({
  organization: ["update"],
  invitation: ["create", "cancel"],
  member: ["create", "update", "delete"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});

export const ownerAc = defaultAc.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});

export const memberAc = defaultAc.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],  // Can only read roles
});
```

---

## 3. Current Dynamic Access Control Implementation

### 3.1 What's Dynamic Now?

When `dynamicAccessControl.enabled = true`:
- **Roles become customizable per organization**
- New database table: `organizationRole`
- CRUD endpoints are added: `createOrgRole`, `deleteOrgRole`, `updateOrgRole`, `listOrgRoles`, `getOrgRole`

### 3.2 Database Schema - OrganizationRole Table

```typescript
organizationRole: {
  id: string;
  organizationId: string;     // Foreign key to organization
  role: string;               // Role name (e.g., "developer", "qa")
  permission: string;         // JSON stringified: Record<string, string[]>
  createdAt: Date;
  updatedAt?: Date;
}
```

**Important**: The `permission` field is a JSON string storing the role's permissions:
```json
{
  "organization": ["update"],
  "member": ["create", "update"],
  "team": ["create"]
}
```

### 3.3 Configuration

```typescript
interface OrganizationOptions {
  // ... other options
  
  ac?: AccessControl | undefined;  // Required for dynamic AC
  
  dynamicAccessControl?: {
    enabled?: boolean;
    maximumRolesPerOrganization?: number | ((orgId: string) => Promise<number> | number);
  };
  
  roles?: {
    [key: string]?: Role<any>;  // Pre-defined roles (static)
  };
}
```

**Key point**: You MUST provide an `ac` instance when enabling dynamic access control. This `ac` instance defines the **available resources and permissions** that dynamic roles can use.

### 3.4 How Dynamic Roles Work

#### Creating a Role
From `routes/crud-access-control.ts`:

1. **Endpoint**: `POST /organization/create-role`
2. **Body**: 
   ```typescript
   {
     organizationId?: string;
     role: string;
     permission: Record<string, string[]>;
     additionalFields?: any;
   }
   ```

3. **Validation Process**:
   - Check if `ac` instance exists (required)
   - Get organization ID from body or active session
   - Verify user is a member of the organization
   - Check if user has `ac: ["create"]` permission
   - Check if role name conflicts with pre-defined roles
   - Check if organization has hit max roles limit
   - **Validate resources**: Check if all resources in `permission` exist in `ac.statements`
   - **Validate permissions**: Check if user has all the permissions they're trying to grant
   - Check if role name already exists in DB

4. **Key Validation Function** - `checkForInvalidResources`:
   ```typescript
   const validResources = Object.keys(ac.statements);  // e.g., ["organization", "member", "invitation", "team", "ac"]
   const providedResources = Object.keys(permission);  // e.g., ["organization", "member"]
   const hasInvalidResource = providedResources.some(r => !validResources.includes(r));
   if (hasInvalidResource) {
     throw new APIError("BAD_REQUEST", { message: "INVALID_RESOURCE" });
   }
   ```
   
   **This is where resources are currently restricted!**

5. **Permission Delegation Check** - `checkIfMemberHasPermission`:
   ```typescript
   // For each permission in the new role, check if the creating user has it
   for (const [resource, permissions] of Object.entries(permission)) {
     for (const perm of permissions) {
       const hasIt = await hasPermission({
         options,
         organizationId,
         permissions: { [resource]: [perm] },
         role: member.role,
       }, ctx);
       
       if (!hasIt) {
         throw new APIError("FORBIDDEN", { 
           message: "Missing permissions to create role with those permissions",
           missingPermissions: [...] 
         });
       }
     }
   }
   ```
   
   **This ensures users can only grant permissions they already have.**

6. **Storage**:
   ```typescript
   await ctx.context.adapter.create({
     model: "organizationRole",
     data: {
       createdAt: new Date(),
       organizationId,
       permission: JSON.stringify(permission),  // Store as JSON string
       role: roleName,
       ...additionalFields,
     },
   });
   ```

#### Loading Dynamic Roles

From `has-permission.ts`:

```typescript
export const hasPermission = async (input, ctx) => {
  let acRoles = { ...(input.options.roles || defaultRoles) };  // Start with static roles
  
  if (input.options.dynamicAccessControl?.enabled && input.options.ac) {
    // Load dynamic roles from database
    const roles = await ctx.context.adapter.findMany({
      model: "organizationRole",
      where: [{ field: "organizationId", value: input.organizationId }],
    });
    
    for (const { role, permission: permissionsString } of roles) {
      // Skip if it's a pre-defined role (don't override)
      if (role in acRoles) continue;
      
      // Parse the JSON permissions
      const parsedPermissions = JSON.parse(permissionsString);
      
      // Create a new role instance using the AC
      acRoles[role] = input.options.ac.newRole(parsedPermissions);
    }
  }
  
  // Now check permissions using the combined static + dynamic roles
  return hasPermissionFn(input, acRoles);
};
```

**Flow**:
1. Start with static roles (owner, admin, member)
2. If dynamic AC is enabled, load all roles from `organizationRole` table for the organization
3. For each DB role, parse its permissions and create a Role instance using `ac.newRole()`
4. Merge dynamic roles with static roles (static roles take precedence)
5. Use the combined role set for permission checking

#### Permission Checking

From `permission.ts`:

```typescript
export const hasPermissionFn = (input, acRoles) => {
  const roles = input.role.split(",");  // User can have multiple roles
  
  for (const role of roles) {
    const _role = acRoles[role];
    const result = _role?.authorize(input.permissions);  // Use Role.authorize()
    if (result?.success) {
      return true;  // User has permission
    }
  }
  return false;  // User doesn't have permission
};
```

---

## 4. Key Flows

### 4.1 Permission Check Flow

```
User Action
    ↓
1. Get user's role from member.role (e.g., "admin" or "developer")
    ↓
2. Call hasPermission({ role, permissions, organizationId, options }, ctx)
    ↓
3. hasPermission loads:
   - Static roles from options.roles
   - Dynamic roles from organizationRole table (if enabled)
    ↓
4. For each role the user has:
   - Get the Role instance from acRoles
   - Call role.authorize(permissions)
   - If successful, return true
    ↓
5. Return false if no role authorizes the action
```

### 4.2 Dynamic Role Creation Flow

```
POST /organization/create-role
    ↓
1. Validate user is in organization
    ↓
2. Check user has ac: ["create"] permission
    ↓
3. Validate role name not taken
    ↓
4. FOR EACH resource in permission:
   - Check resource exists in ac.statements
   - FOR EACH action in resource:
     - Check user has that permission (delegation check)
    ↓
5. If all validations pass:
   - Create Role instance: ac.newRole(permission)
   - Store in DB: { role: name, permission: JSON.stringify(permission) }
    ↓
6. Return success
```

### 4.3 Organization Session Flow

```
User logs in
    ↓
Session created with:
  - activeOrganizationId: string | null
  - activeTeamId: string | null (if teams enabled)
    ↓
When user performs action:
  - Fetch member record by userId + activeOrganizationId
  - member.role contains the role name(s)
  - Use hasPermission() with that role
```

---

## 5. Important Functions and Files

### 5.1 Core Permission Functions

#### `hasPermission` (`has-permission.ts`)
- **Purpose**: Check if a user's role has specific permissions
- **Loads**: Static + dynamic roles
- **Caching**: Uses in-memory cache (`cacheAllRoles`) to avoid repeated DB queries
- **Key Logic**: 
  - Loads dynamic roles from DB only if `dynamicAccessControl.enabled`
  - Skips overriding pre-defined roles
  - Uses `ac.newRole()` to create Role instances from DB data

#### `hasPermissionFn` (`permission.ts`)
- **Purpose**: Pure permission checking logic
- **Input**: Role name(s), permissions to check, pre-loaded acRoles
- **Logic**: Iterates through roles, calls `role.authorize()`, returns true if any role succeeds

#### `role.authorize` (`access/access.ts`)
- **Purpose**: Check if a specific role has requested permissions
- **Logic**: 
  - For each requested resource, check if role has it
  - For each requested permission, check if it's in role's allowed list
  - Supports AND/OR connectors

### 5.2 Dynamic Role CRUD (`routes/crud-access-control.ts`)

#### `createOrgRole`
- **Key Validations**:
  - `checkForInvalidResources`: Validates all resources exist in `ac.statements`
  - `checkIfMemberHasPermission`: Ensures user has permissions they're trying to delegate
  - `checkIfRoleNameIsTakenByPreDefinedRole`: Prevents override of static roles
  - `checkIfRoleNameIsTakenByRoleInDB`: Prevents duplicate roles

#### `updateOrgRole`
- Similar validations as create
- Can update role name and/or permissions
- Partial updates supported

#### `deleteOrgRole`
- Cannot delete pre-defined roles
- Removes from DB only

#### `listOrgRoles` / `getOrgRole`
- Requires `ac: ["read"]` permission
- Returns all custom roles for the organization

### 5.3 Schema and Types

#### `OrganizationRole` (`schema.ts`)
```typescript
{
  id: string;
  organizationId: string;
  role: string;
  permission: Record<string, string[]>;  // Type-level
  // Stored as JSON string in DB
  createdAt: Date;
  updatedAt?: Date;
}
```

#### `OrganizationOptions` (`types.ts`)
- Contains all configuration for the plugin
- Key fields for RBAC:
  - `ac?: AccessControl` - The access control instance defining resources
  - `roles?: { [key: string]: Role }` - Pre-defined static roles
  - `dynamicAccessControl?` - Configuration for dynamic roles

---

## 6. Current Limitations (What You Want to Change)

### 6.1 Resources Are Static
**Current State**: Resources (e.g., `organization`, `member`, `team`) are defined once at application level via:

```typescript
const ac = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  // ...
});
```

**Limitation**: All organizations share the same set of resources. You cannot have:
- Organization A with resources: `project`, `document`, `workflow`
- Organization B with resources: `campaign`, `lead`, `contact`

### 6.2 Permissions Within Resources Are Static
**Current State**: The available permissions (actions) for each resource are also defined at application level.

**Limitation**: All organizations must use the same permissions. You cannot have:
- Organization A: `project: ["view", "edit", "approve", "archive"]`
- Organization B: `project: ["read", "write", "publish", "delete"]`

### 6.3 What IS Dynamic
Currently, only **role assignments** are dynamic:
- Role name (e.g., "developer", "qa", "manager")
- Which permissions from the available statements each role gets

---

## 7. What Needs to Change (Your Goals)

### 7.1 Make Resources Customizable Per Organization

**Goal**: Each organization should be able to define their own resources.

**Example**:
```typescript
// Organization A (software company)
resources: {
  project: ["create", "read", "update", "delete"],
  task: ["create", "assign", "complete"],
  sprint: ["create", "start", "close"]
}

// Organization B (marketing agency)
resources: {
  campaign: ["create", "launch", "pause"],
  lead: ["create", "qualify", "convert"],
  report: ["view", "export"]
}
```

### 7.2 Make Permissions Customizable Per Organization

**Goal**: Each organization should be able to define their own actions for each resource.

**Example**:
```typescript
// Organization A
project: ["view", "edit", "approve", "archive", "clone"]

// Organization B
project: ["read", "write", "publish", "unpublish"]
```

### 7.3 Maintain Backward Compatibility

**Goal**: Organizations that don't configure custom resources should continue to work with default resources.

---

## 8. Suggested Implementation Approach

### 8.1 Database Schema Changes

#### Add New Table: `organizationResource`

```typescript
organizationResource: {
  id: string;
  organizationId: string;
  resource: string;              // Resource name (e.g., "project")
  permissions: string;           // JSON array: ["create", "read", "update"]
  createdAt: Date;
  updatedAt?: Date;
}
```

**Alternative Approach**: Store all resources in a single JSON field per organization:

```typescript
// Add to organization table
organization: {
  // ... existing fields
  customResources?: string;  // JSON: { project: ["create", "read"], task: [...] }
}
```

### 8.2 Configuration Changes

```typescript
interface OrganizationOptions {
  // ... existing options
  
  dynamicAccessControl?: {
    enabled?: boolean;
    maximumRolesPerOrganization?: number | ((orgId: string) => Promise<number>);
    
    // NEW: Allow custom resources
    enableCustomResources?: boolean;
    maximumResourcesPerOrganization?: number | ((orgId: string) => Promise<number>);
    
    // NEW: Default resources for organizations without custom resources
    defaultResources?: Record<string, readonly string[]>;
  };
}
```

### 8.3 New Endpoints

Add CRUD endpoints for resources:
- `POST /organization/create-resource`
- `POST /organization/update-resource`
- `POST /organization/delete-resource`
- `GET /organization/list-resources`
- `GET /organization/get-resource`

### 8.4 Modified `hasPermission` Function

```typescript
export const hasPermission = async (input, ctx) => {
  // 1. Get the statements for this organization
  let statements = input.options.ac?.statements || defaultStatements;
  
  if (input.options.dynamicAccessControl?.enableCustomResources) {
    // Load custom resources from DB
    const customResources = await loadCustomResources(input.organizationId, ctx);
    if (customResources) {
      // Create new AC with custom resources
      const customAc = createAccessControl(customResources);
      statements = customAc.statements;
    }
  }
  
  // 2. Load roles (static + dynamic)
  let acRoles = { ...(input.options.roles || defaultRoles) };
  
  if (input.options.dynamicAccessControl?.enabled) {
    const roles = await ctx.context.adapter.findMany({
      model: "organizationRole",
      where: [{ field: "organizationId", value: input.organizationId }],
    });
    
    for (const { role, permission: permissionsString } of roles) {
      if (role in acRoles) continue;
      
      const parsedPermissions = JSON.parse(permissionsString);
      
      // Use the organization-specific statements to create the role
      const ac = createAccessControl(statements);
      acRoles[role] = ac.newRole(parsedPermissions);
    }
  }
  
  // 3. Check permissions
  return hasPermissionFn(input, acRoles);
};
```

### 8.5 Validation Changes

In `createOrgRole` and `updateOrgRole`:

```typescript
// OLD validation:
const validResources = Object.keys(ac.statements);

// NEW validation:
const statements = await getOrganizationStatements(organizationId, options, ctx);
const validResources = Object.keys(statements);
```

---

## 9. Migration Considerations

### 9.1 Backward Compatibility
- Existing organizations continue using default resources
- Flag: `enableCustomResources` defaults to `false`
- When false, behavior is identical to current implementation

### 9.2 Performance
- Cache custom resources per organization
- Load resources + roles in parallel
- Consider caching at application level with invalidation

### 9.3 Validation Complexity
- When creating roles, must validate against organization's custom resources
- When updating resources, must validate existing roles don't break
- May need migration logic if resources are deleted/renamed

---

## 10. Testing Considerations

### 10.1 Unit Tests
- Test `createAccessControl` with custom resources
- Test role creation with custom resources
- Test permission checking with custom resources

### 10.2 Integration Tests
- Test organization with default resources
- Test organization with custom resources
- Test migration from default to custom resources
- Test resource CRUD operations
- Test role validation against custom resources

### 10.3 Edge Cases
- Organization deletes a resource that's used in existing roles
- Organization renames a resource
- User tries to create role with non-existent resource
- Multiple organizations with different resources

---

## 11. Key Files to Modify

### High Priority (Core Logic)
1. `has-permission.ts` - Load organization-specific resources
2. `routes/crud-access-control.ts` - Validate against org-specific resources
3. `schema.ts` - Add organizationResource schema
4. `types.ts` - Update OrganizationOptions

### Medium Priority (New Features)
5. Create `routes/crud-resources.ts` - Resource CRUD endpoints
6. `adapter.ts` - Add resource-related adapter methods
7. `organization.ts` - Wire up new endpoints

### Low Priority (Supporting)
8. Add tests for custom resources
9. Update documentation
10. Add migration utilities

---

## 12. Questions to Consider

1. **Resource Deletion**: What happens to roles that reference a deleted resource?
   - Option A: Cascade delete (remove resource from all roles)
   - Option B: Block deletion if resource is in use
   - Option C: Orphan the permissions (allow but ignore)

Answer: Option B (Block)

2. **Resource Renaming**: How to handle resource renames?
   - Option A: Cascade update (update all roles)
   - Option B: Treat as delete + create
   - Option C: Don't allow renames

Answer: Option C (dont allow)

3. **Default Resources**: Should there be built-in resources that can't be deleted?
   - e.g., `organization`, `member`, `invitation` might be required

Answer: Yes, those are the static resources i think. and they should pair nicely with the dynamic ones.

4. **Permission Defaults**: When adding a new resource, what are default permissions?
   - CRUD: `["create", "read", "update", "delete"]`?
   - Or require explicit permission definition?

Answer: Require explicit permission definition. I will be able to pass anything there.

5. **Performance**: How to optimize loading of custom resources?
   - Cache at application level?
   - Cache per request?
   - Cache in memory map?

Answer: in memory map

6. **Multi-Tenancy**: Should resources be tenant-specific or global per organization?
   - Current: Organization-level (seems appropriate)

Answer: correct, organization is the tenant!

7. **Resource Validation**: Should there be naming restrictions?
   - No special characters?
   - Length limits?
   - Reserved names?

Answer: add reasonable naming restrictions. and let me specify on the plugin config reseved names.

---

## 13. Summary

The organization plugin currently supports:
- ✅ Static resources (defined at app level)
- ✅ Static permissions (defined at app level)
- ✅ Dynamic roles (per organization)

To achieve your goal, you need to make:
- ❌ → ✅ Dynamic resources (per organization)
- ❌ → ✅ Dynamic permissions (per organization)

The key is to modify the `hasPermission` flow to:
1. Load organization-specific resources/permissions from DB
2. Create a custom `AccessControl` instance with those resources
3. Use that AC instance to create/validate roles
4. Perform permission checks against the custom resources

The architecture is well-designed for this extension - the `createAccessControl` and `ac.newRole` pattern already supports arbitrary resources and permissions. The main work is:
- Database schema for storing custom resources
- Loading logic for custom resources
- Validation logic updates
- CRUD endpoints for resource management
- Caching strategy for performance

