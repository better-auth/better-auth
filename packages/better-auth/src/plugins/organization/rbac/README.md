# Better Auth RBAC Organization Plugin

This plugin extends the Better Auth organization plugin with comprehensive database-level Role-Based Access Control (RBAC) capabilities. It provides a complete permission management system that scales from simple role assignments to complex enterprise-level access control with conditional permissions, role hierarchies, and audit trails.

## 🎯 Key Benefits

- **Enterprise-Ready**: Designed for complex organizational structures with multiple teams and hierarchical permissions
- **Database-Driven**: All roles, permissions, and assignments are stored persistently in your database
- **Flexible Architecture**: Supports both simple role-based access and complex attribute-based access control (ABAC)
- **Performance Optimized**: Built-in caching and efficient query patterns for high-performance applications
- **Audit-First Design**: Complete audit trail for compliance and security monitoring
- **Developer Experience**: Full TypeScript support with comprehensive IntelliSense and type safety

## ✨ Features

### Core RBAC Features
- **Database-level RBAC**: Roles, permissions, and assignments are stored in the database with full CRUD operations
- **Role Hierarchy**: Support for hierarchical roles with automatic permission inheritance
- **Resource-based Permissions**: Fine-grained permissions for different resources and actions (e.g., `project:create`, `document:read`)
- **Conditional Permissions**: Time-based, IP-based, and custom condition-based access control
- **User-Role Assignments**: Flexible role assignments with expiration dates and conditions

### Advanced Features
- **Audit Logging**: Complete audit trail of all RBAC operations with IP tracking and user agent logging
- **Policy Engine**: Advanced permission evaluation with custom JavaScript-based policies
- **Resource Hierarchy**: Support for nested resources with inherited permissions
- **Permission Caching**: Configurable caching for high-performance permission checks
- **Bulk Operations**: Efficient bulk role and permission assignments

### Developer Features
- **Comprehensive Hooks**: Extensible hook system for custom business logic and integrations
- **Full TypeScript Support**: Complete type safety and IntelliSense for all RBAC operations
- **Client-Side Integration**: React hooks and utilities for seamless frontend integration
- **Database Agnostic**: Works with all Better Auth supported databases (MySQL, PostgreSQL, SQLite)
- **Migration Support**: Automated database migrations and upgrade paths

## 📋 Prerequisites

Before using the RBAC plugin, ensure you have:

1. **Better Auth** installed and configured
2. **Organization Plugin** as a dependency (RBAC extends organization functionality)
3. **Database** configured with Better Auth (PostgreSQL, MySQL, or SQLite)
4. **TypeScript** recommended for full type safety

## 🚀 Installation & Setup

### Step 1: Install Better Auth

```bash
npm install better-auth
# or
yarn add better-auth
# or
pnpm add better-auth
```

### Step 2: Database Migration

The RBAC plugin automatically creates the necessary database tables. Run the migration:

```bash
npx better-auth migrate
```

This creates the following tables:
- `role` - Role definitions
- `permission` - Permission definitions  
- `rolePermission` - Role-permission mappings
- `memberRole` - User-role assignments
- `resource` - Resource definitions
- `auditLog` - Audit trail
- `policy` - Custom policies (optional)

## 🏗️ Basic Usage

### Server Configuration

Here's a comprehensive example of setting up the RBAC plugin on your server:

```typescript
import { betterAuth } from "better-auth";
import { organizationRbac } from "better-auth/plugins/organization";

export const auth = betterAuth({
  database: {
    // Your database configuration
    provider: "postgres", // or "mysql", "sqlite"
    url: process.env.DATABASE_URL,
  },
  
  // Base URL for your auth API
  baseURL: process.env.BETTER_AUTH_URL,
  
  plugins: [
    organizationRbac({
      // Enable RBAC functionality
      rbac: {
        enabled: true,
        
        // Enable audit logging for compliance
        enableAuditLog: true,
        
        // Enable advanced policy engine
        enablePolicyEngine: true,
        
        // Cache permissions for 5 minutes (300 seconds)
        cacheTTL: 300,
        
        // Default roles created for new organizations
        defaultRoles: [
          {
            name: "Organization Owner",
            description: "Full access to the organization",
            level: 10, // Highest level
            permissions: [
              "organization:*",  // All organization permissions
              "member:*",        // All member permissions
              "team:*",          // All team permissions
              "role:*",          // All role permissions
              "audit:read"       // Can view audit logs
            ],
            isCreatorRole: true // Automatically assigned to org creator
          },
          {
            name: "Manager",
            description: "Can manage teams and projects",
            level: 7,
            permissions: [
              "organization:read",
              "member:invite",
              "member:read",
              "member:update",
              "team:create",
              "team:update",
              "team:read",
              "project:*",
              "role:assign"
            ],
            isCreatorRole: false
          },
          {
            name: "Developer",
            description: "Can work on projects and tasks",
            level: 5,
            permissions: [
              "organization:read",
              "member:read",
              "team:read",
              "project:read",
              "project:update",
              "task:*"
            ],
            isCreatorRole: false
          },
          {
            name: "Viewer",
            description: "Read-only access",
            level: 1,
            permissions: [
              "organization:read",
              "member:read",
              "team:read",
              "project:read",
              "task:read"
            ],
            isCreatorRole: false
          }
        ],
        
        // Define custom permissions for your application domain
        customPermissions: [
          {
            name: "project:create",
            resource: "project",
            action: "create",
            description: "Create new projects"
          },
          {
            name: "project:archive",
            resource: "project", 
            action: "archive",
            description: "Archive completed projects"
          },
          {
            name: "document:publish",
            resource: "document",
            action: "publish", 
            description: "Publish documents for public access"
          },
          {
            name: "integration:configure",
            resource: "integration",
            action: "configure",
            description: "Configure third-party integrations"
          }
        ],
        
        // Define custom resource types
        customResources: [
          {
            name: "project",
            type: "business_entity",
            description: "Project management resources"
          },
          {
            name: "document", 
            type: "content",
            description: "Document and file resources"
          },
          {
            name: "integration",
            type: "system",
            description: "Third-party integration resources"
          }
        ],
        
        // Custom hooks for business logic
        hooks: {
          // Execute custom logic before role creation
          beforeRoleCreate: async (data, context) => {
            console.log(`Creating role: ${data.name} for org: ${data.organizationId}`);
            
            // Example: Validate role name format
            if (!/^[A-Z][a-zA-Z\s]+$/.test(data.name)) {
              throw new Error("Role name must start with capital letter");
            }
          },
          
          // Log role assignments for compliance
          afterRoleAssign: async (data, context) => {
            console.log(`Role ${data.roleId} assigned to user ${data.userId}`);
            
            // Example: Send notification
            await sendNotification({
              type: "role_assigned",
              userId: data.userId,
              roleId: data.roleId,
              organizationId: data.organizationId
            });
          },
          
          // Security monitoring
          onUnauthorizedAccess: async (data, context) => {
            console.warn(`Unauthorized access attempt:`, data);
            
            // Example: Alert security team
            await alertSecurityTeam({
              userId: data.userId,
              permission: data.permission,
              resource: data.resource,
              timestamp: new Date()
            });
          }
        }
      }
    })
  ]
});
```

### Client Configuration

Set up the client-side integration with React hooks and utilities:

```typescript
import { createAuthClient } from "better-auth/client";
import { organizationRbacClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000/api/auth", // Your auth API URL
  
  plugins: [
    organizationRbacClient({
      // Enable automatic permission caching
      enableCache: true,
      
      // Cache duration in milliseconds (5 minutes)
      cacheDuration: 5 * 60 * 1000,
      
      // Automatically refresh permissions when user changes
      autoRefresh: true
    })
  ]
});

// Export typed client for use throughout your app
export const {
  signIn,
  signOut,
  signUp,
  useSession,
  // RBAC-specific exports
  rbac
} = authClient;
```

## 🗄️ Database Schema

The RBAC plugin creates a comprehensive database schema optimized for performance and flexibility. All table names use clean naming without the `rbac` prefix:

### `role` Table
Stores role definitions with hierarchical support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID/String | Primary key, unique role identifier |
| `name` | String | Role name (unique per organization) |
| `description` | String? | Human-readable role description |
| `organizationId` | String | Reference to organization table |
| `level` | Integer | Hierarchy level (higher = more permissions) |
| `parentRoleId` | String? | Parent role for inheritance |
| `isSystem` | Boolean | System-defined role (cannot be deleted) |
| `metadata` | JSON? | Additional role metadata |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last modification timestamp |

**Example Data:**
```sql
INSERT INTO role VALUES (
  'role_123',
  'Senior Developer', 
  'Lead developer with code review permissions',
  'org_456',
  6,
  'role_dev_base', -- Inherits from base Developer role
  false,
  '{"department": "engineering", "band": "senior"}',
  '2024-01-15 10:30:00',
  '2024-01-15 10:30:00'
);
```

### `permission` Table
Defines granular permissions with resource-action patterns.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID/String | Primary key, unique permission identifier |
| `name` | String | Permission name (e.g., "project:create") |
| `resource` | String | Resource type (e.g., "project") |
| `action` | String | Action type (e.g., "create") |
| `description` | String? | Human-readable description |
| `organizationId` | String | Reference to organization |
| `isSystem` | Boolean | System-defined permission |
| `metadata` | JSON? | Additional permission metadata |
| `createdAt` | DateTime | Creation timestamp |

**Permission Naming Convention:**
- Format: `{resource}:{action}`
- Examples: `project:create`, `document:read`, `user:invite`
- Wildcards: `project:*` (all project actions), `*:read` (read all resources)

### `rolePermission` Table
Maps permissions to roles with conditional support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID/String | Primary key |
| `roleId` | String | Reference to role table |
| `permissionId` | String | Reference to permission table |
| `granted` | Boolean | Whether permission is granted (true) or denied (false) |
| `conditions` | JSON? | Conditional permission rules |
| `createdAt` | DateTime | Assignment timestamp |

**Conditional Permissions Example:**
```json
{
  "timeRestricted": true,
  "allowedHours": "09:00-17:00",
  "allowedDays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "ipWhitelist": ["192.168.1.0/24", "10.0.0.0/8"],
  "requireMFA": true,
  "maxUsage": 100
}
```

### `memberRole` Table
Assigns roles to users with expiration and condition support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID/String | Primary key |
| `userId` | String | Reference to user table |
| `roleId` | String | Reference to role table |
| `organizationId` | String | Reference to organization |
| `assignedBy` | String | User who made the assignment |
| `expiresAt` | DateTime? | Optional expiration date |
| `conditions` | JSON? | Assignment conditions |
| `isActive` | Boolean | Whether assignment is currently active |
| `assignedAt` | DateTime | Assignment timestamp |

### `resource` Table
Defines resources with hierarchical relationships.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID/String | Primary key |
| `name` | String | Resource name |
| `type` | String | Resource type classification |
| `organizationId` | String | Reference to organization |
| `parentResourceId` | String? | Parent resource for hierarchy |
| `metadata` | JSON? | Additional resource data |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last modification timestamp |

### `auditLog` Table
Comprehensive audit trail for all RBAC operations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID/String | Primary key |
| `action` | String | Action performed (e.g., "ROLE_ASSIGNED") |
| `resource` | String | Resource type affected |
| `resourceId` | String? | Specific resource ID affected |
| `userId` | String | User who performed the action |
| `organizationId` | String? | Organization context |
| `details` | JSON? | Detailed action information |
| `ipAddress` | String? | IP address of the user |
| `userAgent` | String? | Browser/client user agent |
| `timestamp` | DateTime | When the action occurred |

**Common Audit Actions:**
- `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED`
- `PERMISSION_GRANTED`, `PERMISSION_REVOKED`
- `ROLE_ASSIGNED`, `ROLE_REMOVED`  
- `PERMISSION_CHECKED`, `ACCESS_DENIED`

### `policy` Table (Advanced)
Custom policies for complex permission logic.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID/String | Primary key |
| `name` | String | Policy name |
| `description` | String? | Policy description |
| `organizationId` | String? | Organization scope (null = global) |
| `rules` | JSON | Policy rules in JSON format |
| `isActive` | Boolean | Whether policy is enabled |
| `priority` | Integer | Evaluation priority (higher = evaluated first) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last modification timestamp |

**Policy Rules Example:**
```json
{
  "rules": [
    {
      "effect": "allow",
      "resource": "project",
      "action": "create",
      "condition": "user.department === 'engineering' && user.level >= 5"
    },
    {
      "effect": "deny", 
      "resource": "*",
      "action": "*",
      "condition": "request.time < '09:00' || request.time > '18:00'"
    }
  ]
}
```

## 🔧 API Reference

The RBAC plugin provides comprehensive APIs for both server-side and client-side operations.

### Server-side API

All RBAC operations are available through the `auth.api` object with full TypeScript support:

#### Role Management

```typescript
// Create a new role
const role = await auth.api.createRole({
  name: "Project Manager",
  description: "Manages projects and team members",
  organizationId: "org-123",
  level: 6,
  permissions: ["project:create", "project:update", "member:invite"]
});

// Update an existing role
const updatedRole = await auth.api.updateRole({
  roleId: "role-456",
  data: {
    description: "Updated description",
    level: 7,
    permissions: ["project:*", "member:*"] // Grant all project and member permissions
  }
});

// Delete a role (cascades to remove assignments)
await auth.api.deleteRole({ 
  roleId: "role-456",
  organizationId: "org-123" 
});

// List all roles in an organization
const roles = await auth.api.listRoles({ 
  organizationId: "org-123",
  includePermissions: true, // Include associated permissions
  sortBy: "level", // Sort by hierarchy level
  order: "desc"
});

// Get role details with permissions
const roleDetails = await auth.api.getRole({
  roleId: "role-456",
  includePermissions: true,
  includeUsers: true // Include users with this role
});
```

#### Permission Management

```typescript
// Create a custom permission
const permission = await auth.api.createPermission({
  name: "invoice:approve",
  resource: "invoice",
  action: "approve", 
  description: "Approve invoices for payment",
  organizationId: "org-123"
});

// List all permissions
const permissions = await auth.api.listPermissions({
  organizationId: "org-123",
  resource: "project", // Filter by resource type
  includeSystem: false // Exclude system permissions
});

// Bulk create permissions
const bulkPermissions = await auth.api.createPermissions([
  { name: "report:generate", resource: "report", action: "generate" },
  { name: "report:export", resource: "report", action: "export" },
  { name: "report:schedule", resource: "report", action: "schedule" }
]);
```

#### Role-Permission Assignments

```typescript
// Assign permission to role
await auth.api.assignPermissionToRole({
  roleId: "role-456",
  permissionId: "perm-789",
  granted: true, // Grant the permission
  conditions: {
    timeRestricted: true,
    allowedHours: "09:00-17:00"
  }
});

// Assign multiple permissions to a role
await auth.api.assignPermissionsToRole({
  roleId: "role-456", 
  permissions: [
    { permissionId: "perm-1", granted: true },
    { permissionId: "perm-2", granted: false }, // Explicitly deny
    { permissionId: "perm-3", granted: true, conditions: {...} }
  ]
});

// Revoke permission from role
await auth.api.revokePermissionFromRole({
  roleId: "role-456",
  permissionId: "perm-789"
});

// Get all permissions for a role (including inherited)
const rolePermissions = await auth.api.getRolePermissions({
  roleId: "role-456",
  includeInherited: true // Include permissions from parent roles
});
```

#### User-Role Assignments

```typescript
// Assign role to user
await auth.api.assignRoleToUser({
  userId: "user-123",
  roleId: "role-456", 
  organizationId: "org-123",
  assignedBy: "admin-user-id",
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  conditions: {
    requireMFA: true,
    ipWhitelist: ["192.168.1.0/24"]
  }
});

// Assign multiple roles to user
await auth.api.assignRolesToUser({
  userId: "user-123",
  organizationId: "org-123", 
  roles: [
    { roleId: "role-1", assignedBy: "admin-id" },
    { roleId: "role-2", assignedBy: "admin-id", expiresAt: futureDate }
  ]
});

// Remove role from user
await auth.api.revokeRoleFromUser({
  userId: "user-123",
  roleId: "role-456",
  organizationId: "org-123",
  revokedBy: "admin-user-id"
});

// Get all roles for a user
const memberRoles = await auth.api.getUserRoles({
  userId: "user-123",
  organizationId: "org-123",
  includeExpired: false, // Exclude expired assignments
  includePermissions: true // Include effective permissions
});

// Transfer roles between users
await auth.api.transferRoles({
  fromUserId: "user-123",
  toUserId: "user-456", 
  organizationId: "org-123",
  roleIds: ["role-1", "role-2"], // Specific roles or empty for all
  transferredBy: "admin-user-id"
});
```

#### Permission Checks

```typescript
// Check if user has specific permission
const hasPermission = await auth.api.checkPermission({
  userId: "user-123",
  permission: "project:create",
  organizationId: "org-123",
  resourceId: "project-456", // Optional: check on specific resource
  context: { // Additional context
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0...",
    requestTime: new Date()
  }
});

// Check multiple permissions at once
const permissions = await auth.api.checkPermissions({
  userId: "user-123",
  permissions: ["project:create", "project:update", "project:delete"],
  organizationId: "org-123"
});
// Returns: { "project:create": true, "project:update": true, "project:delete": false }

// Get all effective permissions for user
const allPermissions = await auth.api.getUserPermissions({
  userId: "user-123", 
  organizationId: "org-123",
  includeConditional: true, // Include permissions with conditions
  resolveWildcards: true // Expand wildcard permissions
});

// Bulk permission check for multiple users
const bulkCheck = await auth.api.checkUsersPermissions({
  userIds: ["user-1", "user-2", "user-3"],
  permission: "project:read",
  organizationId: "org-123"
});
```

### Client-side API

The client plugin provides reactive methods with automatic caching and real-time updates:

#### Role Management (Client)

```typescript
// Create role with optimistic updates
const { data: role, error } = await authClient.rbac.roles.create({
  name: "Content Editor",
  organizationId: "org-123",
  permissions: ["content:create", "content:update"]
});

// List roles with real-time updates
const { data: roles, loading, error, refetch } = authClient.rbac.roles.useList({
  organizationId: "org-123"
});

// Update role
await authClient.rbac.roles.update({
  roleId: "role-456",
  data: { description: "Updated description" }
});

// Delete role with confirmation
await authClient.rbac.roles.delete({
  roleId: "role-456",
  confirmMessage: "Are you sure you want to delete this role?"
});
```

#### Permission Management (Client)

```typescript
// Create permission
await authClient.rbac.permissions.create({
  name: "analytics:view",
  resource: "analytics",
  action: "view",
  organizationId: "org-123"
});

// List permissions with filtering
const { data: permissions } = authClient.rbac.permissions.useList({
  organizationId: "org-123",
  resource: "project", // Filter by resource
  search: "create" // Search in permission names
});

// Check permission with caching
const hasPermission = await authClient.rbac.permissions.check({
  permission: "project:create",
  organizationId: "org-123",
  useCache: true // Use cached result if available
});

// Real-time permission status
const { hasPermission, loading } = authClient.rbac.permissions.useCheck({
  permission: "project:create",
  organizationId: "org-123"
});
```

#### User Role Management (Client)

```typescript
// Assign role to user
await authClient.rbac.memberRoles.assign({
  userId: "user-123", 
  roleId: "role-456",
  organizationId: "org-123"
});

// List user roles with real-time updates
const { data: memberRoles } = authClient.rbac.memberRoles.useList({
  userId: "user-123",
  organizationId: "org-123"
});

// Revoke role
await authClient.rbac.memberRoles.revoke({
  userId: "user-123",
  roleId: "role-456", 
  organizationId: "org-123"
});

// Bulk role assignment
await authClient.rbac.memberRoles.assignBulk({
  userIds: ["user-1", "user-2", "user-3"],
  roleId: "role-456",
  organizationId: "org-123"
});
```

#### Audit Logs (Client)

```typescript
// List audit logs with filtering
const { data: logs, loading, hasMore, loadMore } = authClient.rbac.auditLogs.useList({
  organizationId: "org-123",
  action: "ROLE_ASSIGNED", // Filter by action type
  userId: "user-123", // Filter by user
  dateFrom: "2024-01-01",
  dateTo: "2024-01-31",
  limit: 50
});

// Export audit logs
const exportData = await authClient.rbac.auditLogs.export({
  organizationId: "org-123",
  format: "csv", // or "json", "xlsx"
  dateFrom: "2024-01-01",
  dateTo: "2024-01-31"
});

// Real-time audit log streaming
const { data: realtimeLogs } = authClient.rbac.auditLogs.useRealtime({
  organizationId: "org-123",
  filters: { actions: ["ROLE_ASSIGNED", "PERMISSION_GRANTED"] }
});
```

## ⚙️ Configuration Options

The RBAC plugin offers extensive configuration options to tailor the behavior to your application needs.

### Core RBAC Configuration

```typescript
interface RbacOptions {
  // Core functionality
  enabled: boolean; // Enable/disable RBAC functionality
  
  // Performance settings
  enableCache?: boolean; // Enable permission caching (default: true)
  cacheTTL?: number; // Cache time-to-live in seconds (default: 300)
  cacheProvider?: 'memory' | 'redis' | 'custom'; // Cache provider
  
  // Audit and compliance
  enableAuditLog?: boolean; // Enable audit logging (default: true)
  auditLogLevel?: 'basic' | 'detailed' | 'full'; // Audit detail level
  retentionDays?: number; // Audit log retention period (default: 365)
  
  // Advanced features
  enablePolicyEngine?: boolean; // Enable custom policies (default: false)
  enableResourceHierarchy?: boolean; // Enable nested resources (default: true)
  enableRoleHierarchy?: boolean; // Enable role inheritance (default: true)
  enableConditionalPermissions?: boolean; // Enable conditional access (default: true)
  
  // Security settings
  maxRoleDepth?: number; // Maximum role hierarchy depth (default: 10)
  maxPermissionsPerRole?: number; // Max permissions per role (default: 1000)
  maxRolesPerUser?: number; // Max roles per user (default: 50)
  
  // Default data
  defaultRoles?: DefaultRole[];
  customPermissions?: CustomPermission[];
  customResources?: CustomResource[];
  
  // Event hooks
  hooks?: RbacHooks;
  
  // Database options
  tablePrefix?: string; // Custom table prefix (default: none)
  softDelete?: boolean; // Use soft delete for roles/permissions (default: false)
}
```

### Default Roles Configuration

Define roles that are automatically created for new organizations:

```typescript
interface DefaultRole {
  name: string; // Role name (must be unique per organization)
  description?: string; // Human-readable description
  level: number; // Hierarchy level (0-100, higher = more permissions)
  permissions: string[]; // Array of permission names
  isCreatorRole?: boolean; // Auto-assign to organization creator
  isDefaultRole?: boolean; // Auto-assign to new organization members
  conditions?: RoleConditions; // Default conditions for this role
  metadata?: Record<string, any>; // Additional role data
}

// Example: Comprehensive role structure
const defaultRoles: DefaultRole[] = [
  {
    name: "Organization Owner",
    description: "Complete control over the organization",
    level: 100,
    permissions: ["*:*"], // All permissions
    isCreatorRole: true,
    metadata: {
      category: "admin",
      canDelegate: true,
      requiresApproval: false
    }
  },
  {
    name: "Administrator", 
    description: "Administrative access with user management",
    level: 90,
    permissions: [
      "organization:read",
      "organization:update",
      "member:*",
      "team:*", 
      "role:*",
      "audit:read"
    ],
    metadata: {
      category: "admin",
      requiresApproval: true
    }
  },
  {
    name: "Project Manager",
    description: "Manages projects and team coordination",
    level: 70,
    permissions: [
      "organization:read",
      "member:read",
      "member:invite",
      "team:create",
      "team:update",
      "team:read",
      "project:*",
      "task:*"
    ],
    metadata: {
      category: "management",
      department: "operations"
    }
  },
  {
    name: "Team Lead",
    description: "Leads development teams",
    level: 60,
    permissions: [
      "organization:read",
      "member:read",
      "team:read",
      "team:update",
      "project:read",
      "project:update",
      "task:*",
      "code:review"
    ],
    metadata: {
      category: "leadership",
      department: "engineering"
    }
  },
  {
    name: "Senior Developer",
    description: "Experienced developer with mentoring responsibilities",
    level: 50,
    permissions: [
      "organization:read",
      "member:read",
      "team:read",
      "project:read",
      "project:update",
      "task:*",
      "code:write",
      "code:review",
      "deployment:staging"
    ],
    metadata: {
      category: "contributor",
      department: "engineering",
      seniority: "senior"
    }
  },
  {
    name: "Developer",
    description: "Software developer",
    level: 40,
    permissions: [
      "organization:read",
      "member:read",
      "team:read", 
      "project:read",
      "task:read",
      "task:update",
      "code:write"
    ],
    isDefaultRole: true, // Assign to new members by default
    metadata: {
      category: "contributor",
      department: "engineering",
      seniority: "standard"
    }
  },
  {
    name: "Intern",
    description: "Intern with limited access",
    level: 20,
    permissions: [
      "organization:read",
      "member:read",
      "team:read",
      "project:read",
      "task:read"
    ],
    conditions: {
      timeRestricted: true,
      allowedHours: "09:00-17:00",
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      maxDuration: 90 // 90 days
    },
    metadata: {
      category: "limited",
      temporary: true
    }
  },
  {
    name: "External Consultant",
    description: "External consultant with project-specific access",
    level: 30,
    permissions: [
      "organization:read",
      "project:read",
      "task:read",
      "document:read"
    ],
    conditions: {
      ipWhitelist: ["allowed_ip_range"],
      requireMFA: true,
      accessLimited: true
    },
    metadata: {
      category: "external",
      requiresContract: true
    }
  }
];
```

### Custom Permissions Configuration

Define application-specific permissions:

```typescript
interface CustomPermission {
  name: string; // Permission identifier (resource:action format)
  resource: string; // Resource type
  action: string; // Action type
  description?: string; // Human-readable description
  isSystem?: boolean; // System permission (cannot be deleted)
  metadata?: Record<string, any>; // Additional permission data
}

// Example: E-commerce platform permissions
const customPermissions: CustomPermission[] = [
  // Product management
  {
    name: "product:create",
    resource: "product",
    action: "create",
    description: "Create new products",
    metadata: { category: "catalog", riskLevel: "medium" }
  },
  {
    name: "product:publish",
    resource: "product", 
    action: "publish",
    description: "Publish products to storefront",
    metadata: { category: "catalog", riskLevel: "high" }
  },
  
  // Order management
  {
    name: "order:process",
    resource: "order",
    action: "process", 
    description: "Process customer orders",
    metadata: { category: "fulfillment", riskLevel: "high" }
  },
  {
    name: "order:refund",
    resource: "order",
    action: "refund",
    description: "Issue order refunds",
    metadata: { category: "customer_service", riskLevel: "high" }
  },
  
  // Financial operations
  {
    name: "payment:process",
    resource: "payment",
    action: "process",
    description: "Process payments",
    metadata: { category: "finance", riskLevel: "critical" }
  },
  {
    name: "report:financial",
    resource: "report", 
    action: "financial",
    description: "Access financial reports",
    metadata: { category: "analytics", riskLevel: "high" }
  },
  
  // Customer management
  {
    name: "customer:export",
    resource: "customer",
    action: "export",
    description: "Export customer data",
    metadata: { category: "data", riskLevel: "high", gdprSensitive: true }
  },
  
  // System administration
  {
    name: "system:backup",
    resource: "system",
    action: "backup", 
    description: "Create system backups",
    isSystem: true,
    metadata: { category: "admin", riskLevel: "critical" }
  }
];
```

### Custom Resources Configuration

Define resource types in your application:

```typescript
interface CustomResource {
  name: string; // Resource name
  type: string; // Resource type category
  description?: string; // Human-readable description
  hierarchical?: boolean; // Supports parent-child relationships
  metadata?: Record<string, any>; // Additional resource data
}

const customResources: CustomResource[] = [
  {
    name: "project",
    type: "business_entity",
    description: "Software development projects",
    hierarchical: true, // Projects can have sub-projects
    metadata: {
      trackable: true,
      auditable: true,
      lifecycle: ["planning", "development", "testing", "deployment", "maintenance"]
    }
  },
  {
    name: "document",
    type: "content",
    description: "Documentation and files",
    hierarchical: true,
    metadata: {
      versionable: true,
      shareable: true,
      searchable: true
    }
  },
  {
    name: "integration",
    type: "system",
    description: "Third-party integrations",
    hierarchical: false,
    metadata: {
      configurable: true,
      testable: true,
      statusMonitored: true
    }
  },
  {
    name: "report",
    type: "analytics", 
    description: "Business intelligence reports",
    hierarchical: true,
    metadata: {
      schedulable: true,
      exportable: true,
      cacheable: true
    }
  }
];
```

### 🪝 Hook System

The plugin provides comprehensive hooks for customizing behavior and integrating with external systems:

```typescript
interface RbacHooks {
  // Role lifecycle hooks
  beforeRoleCreate?: (data: RoleCreateData, context: HookContext) => Promise<void | { data: RoleCreateData }>;
  afterRoleCreate?: (role: Role, context: HookContext) => Promise<void>;
  beforeRoleUpdate?: (data: RoleUpdateData, context: HookContext) => Promise<void | { data: RoleUpdateData }>;
  afterRoleUpdate?: (role: Role, previousData: Role, context: HookContext) => Promise<void>;
  beforeRoleDelete?: (roleId: string, context: HookContext) => Promise<void>;
  afterRoleDelete?: (deletedRole: Role, context: HookContext) => Promise<void>;
  
  // Permission lifecycle hooks
  beforePermissionCreate?: (data: PermissionCreateData, context: HookContext) => Promise<void | { data: PermissionCreateData }>;
  afterPermissionCreate?: (permission: Permission, context: HookContext) => Promise<void>;
  beforePermissionDelete?: (permissionId: string, context: HookContext) => Promise<void>;
  afterPermissionDelete?: (deletedPermission: Permission, context: HookContext) => Promise<void>;
  
  // Permission evaluation hooks
  beforePermissionCheck?: (data: PermissionCheckData, context: HookContext) => Promise<void | { result: boolean }>;
  afterPermissionCheck?: (data: PermissionCheckData, result: boolean, context: HookContext) => Promise<void>;
  
  // Role assignment hooks
  beforeRoleAssign?: (data: RoleAssignmentData, context: HookContext) => Promise<void | { data: RoleAssignmentData }>;
  afterRoleAssign?: (assignment: MemberRole, context: HookContext) => Promise<void>;
  beforeRoleRevoke?: (data: RoleRevocationData, context: HookContext) => Promise<void>;
  afterRoleRevoke?: (revokedAssignment: MemberRole, context: HookContext) => Promise<void>;
  
  // Organization integration hooks
  onOrganizationCreate?: (organization: Organization, context: HookContext) => Promise<void>;
  onMemberJoin?: (member: Member, organization: Organization, context: HookContext) => Promise<void>;
  onMemberLeave?: (member: Member, organization: Organization, context: HookContext) => Promise<void>;
  
  // Security and audit hooks
  onUnauthorizedAccess?: (data: UnauthorizedAccessData, context: HookContext) => Promise<void>;
  onSuspiciousActivity?: (data: SuspiciousActivityData, context: HookContext) => Promise<void>;
  beforeAuditLog?: (data: AuditLogData, context: HookContext) => Promise<void | { data: AuditLogData }>;
  afterAuditLog?: (log: AuditLog, context: HookContext) => Promise<void>;
  
  // Performance and maintenance hooks
  onCacheHit?: (key: string, data: any, context: HookContext) => Promise<void>;
  onCacheMiss?: (key: string, context: HookContext) => Promise<void>;
  onSlowQuery?: (query: string, duration: number, context: HookContext) => Promise<void>;
}

interface HookContext {
  user?: User; // Current user (if authenticated)
  session?: Session; // Current session
  organization?: Organization; // Current organization context
  ipAddress?: string; // Request IP address
  userAgent?: string; // Request user agent
  requestId?: string; // Unique request identifier
  timestamp: Date; // Hook execution timestamp
}
```

#### Hook Examples

**Role Management Hooks:**

```typescript
const rbacHooks: RbacHooks = {
  // Validate role creation
  beforeRoleCreate: async (data, context) => {
    // Validate role name format
    if (!/^[A-Z][a-zA-Z\s]+$/.test(data.name)) {
      throw new Error("Role name must start with capital letter and contain only letters and spaces");
    }
    
    // Check organization role limits
    const existingRoles = await getRoleCount(data.organizationId);
    if (existingRoles >= 50) {
      throw new Error("Organization has reached maximum role limit");
    }
    
    // Modify data before creation
    return {
      data: {
        ...data,
        name: data.name.trim(),
        metadata: {
          ...data.metadata,
          createdBy: context.user?.id,
          createdAt: context.timestamp
        }
      }
    };
  },
  
  // Send notifications after role creation
  afterRoleCreate: async (role, context) => {
    // Notify organization admins
    await notificationService.send({
      type: "role_created",
      recipients: await getOrganizationAdmins(role.organizationId),
      data: {
        roleName: role.name,
        createdBy: context.user?.name,
        organizationId: role.organizationId
      }
    });
    
    // Log to external audit system
    await externalAudit.log({
      action: "ROLE_CREATED",
      resource: "role",
      resourceId: role.id,
      userId: context.user?.id,
      organizationId: role.organizationId,
      details: role
    });
  },
  
  // Prevent deletion of critical roles
  beforeRoleDelete: async (roleId, context) => {
    const role = await getRole(roleId);
    
    // Prevent deletion of system roles
    if (role.isSystem) {
      throw new Error("Cannot delete system-defined roles");
    }
    
    // Prevent deletion if users are assigned
    const assignedUsers = await getUsersWithRole(roleId);
    if (assignedUsers.length > 0) {
      throw new Error(`Cannot delete role: ${assignedUsers.length} users are assigned to this role`);
    }
    
    // Require approval for high-level roles
    if (role.level >= 80) {
      const hasApproval = await checkDeletionApproval(roleId, context.user?.id);
      if (!hasApproval) {
        throw new Error("Deletion of high-level roles requires approval");
      }
    }
  }
};
```

**Permission Check Hooks:**

```typescript
const securityHooks: RbacHooks = {
  // Enhanced permission checking with custom logic
  beforePermissionCheck: async (data, context) => {
    // Rate limiting for permission checks
    const rateLimitKey = `perm_check:${data.userId}:${context.ipAddress}`;
    const checkCount = await redis.get(rateLimitKey) || 0;
    
    if (checkCount > 1000) { // 1000 checks per hour
      throw new Error("Too many permission checks, please try again later");
    }
    
    await redis.setex(rateLimitKey, 3600, checkCount + 1);
    
    // Geo-location restrictions
    if (data.permission.includes("financial")) {
      const location = await getGeoLocation(context.ipAddress);
      if (!ALLOWED_COUNTRIES.includes(location.country)) {
        return { result: false }; // Deny access from restricted countries
      }
    }
    
    // Time-based restrictions
    const currentHour = new Date().getHours();
    if (data.permission.includes("admin") && (currentHour < 6 || currentHour > 22)) {
      // Admin operations only allowed during business hours
      return { result: false };
    }
  },
  
  // Log permission checks for analytics
  afterPermissionCheck: async (data, result, context) => {
    // Analytics tracking
    await analytics.track({
      event: "permission_checked",
      userId: data.userId,
      permission: data.permission,
      result,
      organizationId: data.organizationId,
      context: {
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        timestamp: context.timestamp
      }
    });
    
    // Alert on denied admin permissions
    if (!result && data.permission.includes("admin")) {
      await alertService.send({
        level: "warning",
        message: `Admin permission denied for user ${data.userId}`,
        data: {
          permission: data.permission,
          ipAddress: context.ipAddress,
          timestamp: context.timestamp
        }
      });
    }
  }
};
```

**Security Monitoring Hooks:**

```typescript
const securityMonitoring: RbacHooks = {
  // Monitor unauthorized access attempts
  onUnauthorizedAccess: async (data, context) => {
    // Increment failed attempt counter
    const attemptKey = `failed_access:${data.userId}:${context.ipAddress}`;
    const attempts = await redis.incr(attemptKey);
    await redis.expire(attemptKey, 3600); // Reset after 1 hour
    
    // Block IP after 10 failed attempts
    if (attempts >= 10) {
      await securityService.blockIP(context.ipAddress, "Multiple unauthorized access attempts");
    }
    
    // Send security alert
    await securityService.alert({
      type: "unauthorized_access",
      severity: attempts > 5 ? "high" : "medium",
      userId: data.userId,
      permission: data.permission,
      ipAddress: context.ipAddress,
      attempts
    });
    
    // Log to SIEM system
    await siemService.log({
      eventType: "UNAUTHORIZED_ACCESS",
      source: "better-auth-rbac",
      user: data.userId,
      resource: data.resource,
      permission: data.permission,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      timestamp: context.timestamp
    });
  },
  
  // Detect suspicious activity patterns
  onSuspiciousActivity: async (data, context) => {
    const patterns = [
      "rapid_permission_escalation",
      "unusual_access_pattern", 
      "bulk_role_assignment",
      "off_hours_admin_activity"
    ];
    
    if (patterns.includes(data.pattern)) {
      // Temporarily freeze user account
      await userService.freezeAccount(data.userId, "Suspicious activity detected");
      
      // Notify security team immediately
      await emergencyNotification.send({
        type: "security_incident",
        priority: "high",
        userId: data.userId,
        pattern: data.pattern,
        details: data.details,
        context
      });
      
      // Create security incident ticket
      await ticketingSystem.create({
        type: "security_incident",
        title: `Suspicious RBAC activity: ${data.pattern}`,
        description: `User ${data.userId} triggered security alert: ${data.pattern}`,
        severity: "high",
        assignee: "security-team"
      });
    }
  }
};
```

**Organization Integration Hooks:**

```typescript
const organizationHooks: RbacHooks = {
  // Setup default RBAC structure for new organizations
  onOrganizationCreate: async (organization, context) => {
    // Create default teams
    const defaultTeams = [
      { name: "Administrators", level: 90 },
      { name: "Managers", level: 70 },
      { name: "Developers", level: 50 },
      { name: "Users", level: 10 }
    ];
    
    for (const team of defaultTeams) {
      await createTeam({
        name: team.name,
        organizationId: organization.id,
        metadata: { level: team.level, default: true }
      });
    }
    
    // Setup organization-specific permissions
    const orgPermissions = [
      `org:${organization.id}:read`,
      `org:${organization.id}:update`,
      `org:${organization.id}:delete`
    ];
    
    for (const permission of orgPermissions) {
      await createPermission({
        name: permission,
        resource: "organization",
        action: permission.split(":")[2],
        organizationId: organization.id
      });
    }
    
    // Setup integration with external systems
    await externalHR.createOrganization({
      id: organization.id,
      name: organization.name,
      rbacEnabled: true
    });
  },
  
  // Handle new member onboarding
  onMemberJoin: async (member, organization, context) => {
    // Assign default role based on email domain
    const emailDomain = member.user.email.split("@")[1];
    let defaultRole = "User";
    
    if (emailDomain === organization.domain) {
      defaultRole = "Developer"; // Internal employees get developer role
    }
    
    const role = await findRoleByName(defaultRole, organization.id);
    if (role) {
      await assignRoleToUser({
        userId: member.userId,
        roleId: role.id,
        organizationId: organization.id,
        assignedBy: "system"
      });
    }
    
    // Send welcome email with role information
    await emailService.sendWelcome({
      to: member.user.email,
      data: {
        organizationName: organization.name,
        roleName: defaultRole,
        permissions: await getRolePermissions(role.id)
      }
    });
    
    // Setup workspace in external tools
    await workspaceService.createUserWorkspace({
      userId: member.userId,
      organizationId: organization.id,
      role: defaultRole
    });
  }
};
```

## 🚀 Advanced Features

### Role Hierarchy & Inheritance

Create sophisticated role structures with automatic permission inheritance:

```typescript
// Create a base role
const baseDeveloper = await authClient.rbac.roles.create({
  name: "Developer",
  level: 40,
  permissions: ["project:read", "task:read", "task:update", "code:write"],
  organizationId: "org-123"
});

// Create a senior role that inherits from Developer
const seniorDeveloper = await authClient.rbac.roles.create({
  name: "Senior Developer", 
  level: 50,
  parentRoleId: baseDeveloper.id, // Inherits all Developer permissions
  permissions: ["code:review", "deployment:staging"], // Additional permissions
  organizationId: "org-123"
});

// Create team lead that inherits from Senior Developer
const teamLead = await authClient.rbac.roles.create({
  name: "Team Lead",
  level: 60,
  parentRoleId: seniorDeveloper.id, // Inherits Developer + Senior Developer permissions
  permissions: ["team:manage", "performance:review"], // Additional permissions
  organizationId: "org-123"
});

// Check effective permissions (includes inherited)
const effectivePermissions = await authClient.rbac.roles.getEffectivePermissions({
  roleId: teamLead.id
});
// Returns: ["project:read", "task:read", "task:update", "code:write", "code:review", "deployment:staging", "team:manage", "performance:review"]
```

### Conditional Permissions & Time-Based Access

Implement sophisticated access control with conditions:

```typescript
// Time-restricted access
await authClient.rbac.memberRoles.assign({
  userId: "contractor-123",
  roleId: "developer-role-id",
  organizationId: "org-123",
  conditions: {
    timeRestricted: true,
    allowedHours: "09:00-17:00", // Only during business hours
    allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    timezone: "America/New_York",
    maxDuration: 90, // Assignment expires after 90 days
    renewalRequired: true // Requires manual renewal
  }
});

// IP-based restrictions
await authClient.rbac.memberRoles.assign({
  userId: "remote-worker-456", 
  roleId: "developer-role-id",
  organizationId: "org-123",
  conditions: {
    ipWhitelist: [
      "192.168.1.0/24", // Office network
      "203.0.113.0/24"  // Home office
    ],
    requireVPN: true,
    maxSimultaneousSessions: 1
  }
});

// Multi-factor authentication requirements
await authClient.rbac.memberRoles.assign({
  userId: "admin-789",
  roleId: "admin-role-id", 
  organizationId: "org-123",
  conditions: {
    requireMFA: true,
    mfaMethods: ["totp", "hardware_key"], // Specific MFA methods
    sessionTimeout: 30, // Minutes
    reAuthRequired: 120 // Re-authenticate every 2 hours for admin actions
  }
});

// Resource-specific conditions
await authClient.rbac.permissions.assign({
  roleId: "project-manager-role",
  permissionId: "project:delete",
  conditions: {
    resourceConstraints: {
      "project.status": "completed", // Can only delete completed projects
      "project.value": { "$lt": 10000 }, // Only projects under $10k
      "project.owner": "self" // Only projects they own
    },
    approvalRequired: {
      threshold: 5000, // Requires approval for projects over $5k
      approvers: ["senior-manager", "director"]
    }
  }
});
```

### Resource-Based Permissions

Implement fine-grained access control on specific resources:

```typescript
// Check permission on specific resource
const canEditProject = await authClient.rbac.permissions.check({
  permission: "project:update",
  resourceId: "project-456",
  organizationId: "org-123",
  context: {
    projectStatus: "active",
    userRole: "developer",
    projectOwner: "user-123"
  }
});

// Bulk permission check across multiple resources
const projectPermissions = await authClient.rbac.permissions.checkBulk({
  permission: "project:read",
  resourceIds: ["project-1", "project-2", "project-3"],
  organizationId: "org-123"
});
// Returns: { "project-1": true, "project-2": false, "project-3": true }

// Resource hierarchy permissions
await authClient.rbac.resources.create({
  name: "Mobile App Project",
  type: "project",
  organizationId: "org-123",
  parentResourceId: "engineering-department", // Inherits department permissions
  metadata: {
    budget: 50000,
    priority: "high",
    technologies: ["react-native", "nodejs"]
  }
});

// Grant resource-specific permissions
await authClient.rbac.resources.grantPermission({
  resourceId: "project-456",
  userId: "developer-123", // Or roleId for role-based
  permission: "project:deploy",
  conditions: {
    environment: ["staging"], // Can only deploy to staging
    requiresApproval: true,
    maxDeploysPerDay: 3
  }
});
```

### Advanced Policy Engine

Create complex permission logic with JavaScript-based policies:

```typescript
// Define a complex policy
await authClient.rbac.policies.create({
  name: "Financial Data Access Policy",
  organizationId: "org-123",
  priority: 100, // High priority
  rules: [
    {
      effect: "allow",
      resource: "financial_report",
      action: "read",
      condition: `
        user.department === 'finance' ||
        (user.department === 'management' && user.level >= 7) ||
        (user.roles.includes('auditor') && request.purpose === 'audit')
      `
    },
    {
      effect: "deny",
      resource: "financial_report", 
      action: "export",
      condition: `
        request.time.getHours() < 9 || 
        request.time.getHours() > 17 ||
        !user.mfaVerified ||
        user.location.country !== 'US'
      `
    },
    {
      effect: "allow",
      resource: "budget",
      action: "approve",
      condition: `
        user.roles.includes('budget_approver') &&
        resource.amount <= user.approvalLimit &&
        resource.department === user.department
      `
    }
  ]
});

// Policy with dynamic data loading
await authClient.rbac.policies.create({
  name: "Project Access Policy",
  organizationId: "org-123", 
  rules: [
    {
      effect: "allow",
      resource: "project",
      action: "*",
      condition: `
        // Load additional context
        const projectTeam = await loadProjectTeam(resource.id);
        const userTeams = await loadUserTeams(user.id);
        
        // Check if user is part of project team
        return projectTeam.some(member => 
          userTeams.includes(member.teamId) && 
          member.permissions.includes(request.action)
        );
      `
    }
  ]
});
```

### Audit Logging & Compliance

Comprehensive audit trails for regulatory compliance:

```typescript
// Configure detailed audit logging
const rbacConfig = {
  enableAuditLog: true,
  auditLogLevel: "full", // basic | detailed | full
  retentionDays: 2555, // 7 years for compliance
  
  // Custom audit fields
  auditFields: {
    includeRequestHeaders: true,
    includeResponseData: false,
    includeClientInfo: true,
    includeGeoLocation: true
  },
  
  // Compliance settings
  compliance: {
    gdpr: true, // GDPR compliance features
    sox: true,  // Sarbanes-Oxley compliance
    hipaa: false, // HIPAA compliance
    pci: false   // PCI DSS compliance
  }
};

// Search audit logs with advanced filtering
const auditLogs = await authClient.rbac.auditLogs.search({
  organizationId: "org-123",
  dateFrom: "2024-01-01",
  dateTo: "2024-12-31",
  actions: ["ROLE_ASSIGNED", "PERMISSION_GRANTED", "ACCESS_DENIED"],
  users: ["admin-123", "manager-456"],
  resources: ["project", "financial_report"],
  riskLevel: "high", // Filter by risk level
  compliance: "sox", // Compliance-related actions
  anomalous: true, // Potentially suspicious activities
  limit: 1000,
  format: "json" // json | csv | pdf
});

// Generate compliance reports
const complianceReport = await authClient.rbac.compliance.generateReport({
  type: "user_access_review",
  organizationId: "org-123",
  period: "quarterly",
  includeRoleChanges: true,
  includePermissionChanges: true,
  includeAnomalies: true,
  format: "pdf"
});

// Export audit data for external systems
const auditExport = await authClient.rbac.auditLogs.export({
  organizationId: "org-123",
  dateFrom: "2024-01-01",
  dateTo: "2024-01-31",
  format: "siem", // Format for SIEM systems
  destination: {
    type: "s3",
    bucket: "compliance-logs",
    encryption: true
  }
});
```

### Performance Optimization

Optimize RBAC performance for large-scale applications:

```typescript
// Configure intelligent caching
const performanceConfig = {
  enableCache: true,
  cacheProvider: "redis", // memory | redis | custom
  cacheTTL: 300, // 5 minutes
  
  // Cache strategies
  cacheStrategies: {
    permissions: "write-through", // write-through | write-behind | read-through
    roles: "write-through",
    memberRoles: "write-behind"
  },
  
  // Pre-loading strategies
  preloadStrategies: {
    userPermissions: true, // Preload user permissions on login
    roleHierarchy: true,   // Preload role hierarchy
    commonPermissions: true // Preload frequently checked permissions
  },
  
  // Query optimization
  queryOptimization: {
    batchSize: 100, // Batch size for bulk operations
    indexHints: true, // Use database index hints
    connectionPooling: true,
    readReplicas: true // Use read replicas for permission checks
  }
};

// Bulk operations for efficiency
await authClient.rbac.memberRoles.assignBulk({
  assignments: [
    { userId: "user-1", roleId: "role-a", organizationId: "org-123" },
    { userId: "user-2", roleId: "role-b", organizationId: "org-123" },
    { userId: "user-3", roleId: "role-c", organizationId: "org-123" }
  ],
  batchSize: 50 // Process in batches of 50
});

// Efficient permission checking with caching
const permissions = await authClient.rbac.permissions.checkMultiple({
  userId: "user-123",
  permissions: ["project:read", "project:write", "project:delete"],
  organizationId: "org-123",
  useCache: true, // Use cached results when available
  cacheKey: "user-123-project-perms" // Custom cache key
});

// Performance monitoring
const performanceMetrics = await authClient.rbac.performance.getMetrics({
  organizationId: "org-123",
  timeframe: "24h",
  metrics: [
    "permission_check_latency",
    "cache_hit_ratio", 
    "slow_queries",
    "concurrent_users"
  ]
});
```

## 🎯 Best Practices

### Role Design Principles

**1. Business-Oriented Roles**
- Design roles around business functions, not technical capabilities
- Use clear, descriptive names that non-technical stakeholders understand
- Example: "Content Editor" instead of "User with Create/Update Permissions"

```typescript
// ✅ Good: Business-focused roles
const roles = [
  "Content Editor",
  "Marketing Manager", 
  "Sales Representative",
  "Customer Support Agent",
  "Financial Analyst"
];

// ❌ Bad: Technical-focused roles  
const roles = [
  "CRUD User",
  "Read-Only User",
  "Admin User",
  "API User"
];
```

**2. Hierarchical Structure**
- Design clear hierarchy with logical level progression
- Ensure higher levels include lower level permissions
- Avoid circular dependencies in role inheritance

```typescript
// ✅ Good: Clear hierarchy
const roleHierarchy = {
  "Intern": { level: 10, permissions: ["read"] },
  "Junior Developer": { level: 20, parentRole: "Intern", permissions: ["write"] },
  "Developer": { level: 30, parentRole: "Junior Developer", permissions: ["deploy:dev"] },
  "Senior Developer": { level: 40, parentRole: "Developer", permissions: ["review", "mentor"] },
  "Team Lead": { level: 50, parentRole: "Senior Developer", permissions: ["manage_team"] }
};
```

**3. Principle of Least Privilege**
- Grant minimum permissions necessary for job function
- Regularly audit and remove unused permissions
- Use time-limited assignments for temporary access

```typescript
// ✅ Good: Minimal necessary permissions
await assignRoleToUser({
  userId: "contractor-123",
  roleId: "project-contributor", // Limited scope
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  conditions: {
    projectIds: ["project-456"], // Only specific project
    requireMFA: true
  }
});
```

### Permission Naming Conventions

**1. Resource:Action Pattern**
- Use consistent `resource:action` format
- Keep resource names singular and lowercase
- Use descriptive action verbs

```typescript
// ✅ Good: Consistent naming
const permissions = [
  "project:create",
  "project:read", 
  "project:update",
  "project:delete",
  "document:publish",
  "user:invite",
  "report:export"
];

// ❌ Bad: Inconsistent naming
const permissions = [
  "CreateProject",
  "read_project",
  "UPDATE-PROJECT", 
  "del_proj",
  "publishDoc",
  "userInvite"
];
```

**2. Wildcard Usage**
- Use wildcards sparingly and document their scope
- Prefer explicit permissions over broad wildcards
- Reserve `*:*` for super-admin roles only

```typescript
// ✅ Good: Specific wildcards
const managerPermissions = [
  "project:*",      // All project operations
  "team:read",      // Specific team permission
  "report:read"     // Specific report permission
];

// ⚠️ Use cautiously: Broad wildcards
const adminPermissions = [
  "*:read",         // Read everything (broad but safer)
  "admin:*"         // All admin operations (risky)
];

// ❌ Dangerous: Super wildcards
const superAdminPermissions = [
  "*:*"             // Everything (only for emergency accounts)
];
```

### Security Best Practices

**1. Multi-Factor Authentication**
- Require MFA for privileged roles
- Use hardware tokens for high-security roles
- Implement step-up authentication for sensitive operations

```typescript
const securityRoles = {
  "Administrator": {
    conditions: {
      requireMFA: true,
      mfaMethods: ["totp", "hardware_key"],
      sessionTimeout: 30, // 30 minutes
      reAuthRequired: 60  // Re-auth every hour
    }
  },
  "Financial Manager": {
    conditions: {
      requireMFA: true,
      stepUpAuth: ["financial:*"], // Step-up for financial operations
      ipWhitelist: ["office_network"]
    }
  }
};
```

**2. IP and Location Restrictions**
- Restrict sensitive roles to office networks
- Monitor and alert on unusual locations
- Use VPN requirements for remote access

```typescript
const locationSecurity = {
  conditions: {
    ipWhitelist: [
      "192.168.1.0/24",    // Office network
      "10.0.0.0/8"         // VPN range
    ],
    geoRestrictions: {
      allowedCountries: ["US", "CA", "GB"],
      blockVPN: false,     // Allow VPN usage
      blockTor: true       // Block Tor access
    },
    alertOnNewLocation: true
  }
};
```

**3. Time-Based Access Controls**
- Implement business hours restrictions
- Use automatic role expiration
- Regular access reviews

```typescript
const timeBasedAccess = {
  conditions: {
    timeRestricted: true,
    allowedHours: "08:00-18:00",
    allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    timezone: "America/New_York",
    maxDuration: 90, // Days
    renewalRequired: true,
    accessReviewInterval: 30 // Days
  }
};
```

### Performance Optimization

**1. Caching Strategy**
- Cache frequently checked permissions
- Use appropriate cache TTL based on data sensitivity
- Implement cache invalidation on role changes

```typescript
const cacheConfig = {
  enableCache: true,
  strategies: {
    // User permissions: Cache for 5 minutes
    userPermissions: { ttl: 300, strategy: "write-through" },
    
    // Role definitions: Cache for 1 hour (changes less frequently)
    roles: { ttl: 3600, strategy: "write-behind" },
    
    // Permission checks: Cache for 1 minute
    permissionChecks: { ttl: 60, strategy: "read-through" }
  }
};
```

**2. Database Optimization**
- Use proper indexing on frequently queried columns
- Implement read replicas for permission checks
- Use batch operations for bulk changes

```typescript
// ✅ Good: Batch operations
await assignRolesBulk({
  assignments: userRoleAssignments, // Array of assignments
  batchSize: 100
});

// ❌ Bad: Individual operations
for (const assignment of userRoleAssignments) {
  await assignRoleToUser(assignment); // Creates N database calls
}
```

**3. Query Optimization**
- Minimize permission check calls
- Use bulk permission checking
- Implement permission inheritance efficiently

```typescript
// ✅ Good: Bulk permission check
const permissions = await checkPermissionsBulk({
  userId: "user-123",
  permissions: ["project:read", "project:write", "project:delete"],
  useCache: true
});

// ❌ Bad: Multiple individual checks
const canRead = await checkPermission({ userId: "user-123", permission: "project:read" });
const canWrite = await checkPermission({ userId: "user-123", permission: "project:write" });
const canDelete = await checkPermission({ userId: "user-123", permission: "project:delete" });
```

## 🔧 Troubleshooting

### Common Issues and Solutions

**1. Permission Check Performance Issues**

*Problem:* Slow permission checks affecting application performance

*Solutions:*
```typescript
// Enable caching
const config = {
  enableCache: true,
  cacheTTL: 300, // 5 minutes
  cacheProvider: "redis" // Use Redis for distributed caching
};

// Use bulk checks instead of individual checks
const permissions = await checkPermissionsBulk({
  userId: "user-123",
  permissions: allRequiredPermissions,
  useCache: true
});

// Pre-load user permissions on login
await preloadUserPermissions("user-123");
```

**2. Role Hierarchy Circular Dependencies**

*Problem:* Roles creating circular inheritance chains

*Solutions:*
```typescript
// Validate role hierarchy before creation
const validateRoleHierarchy = async (roleId: string, parentRoleId: string) => {
  const ancestry = await getRoleAncestry(parentRoleId);
  if (ancestry.includes(roleId)) {
    throw new Error("Circular dependency detected in role hierarchy");
  }
};

// Limit maximum hierarchy depth
const MAX_ROLE_DEPTH = 10;
const validateRoleDepth = async (parentRoleId: string) => {
  const depth = await getRoleDepth(parentRoleId);
  if (depth >= MAX_ROLE_DEPTH) {
    throw new Error(`Role hierarchy exceeds maximum depth of ${MAX_ROLE_DEPTH}`);
  }
};
```

**3. Memory Issues with Large Permission Sets**

*Problem:* High memory usage when loading permissions for users with many roles

*Solutions:*
```typescript
// Use pagination for large permission sets
const getUserPermissions = async (userId: string, options = {}) => {
  const { page = 1, limit = 100 } = options;
  return await paginatePermissions(userId, { page, limit });
};

// Lazy load permissions on demand
const lazyPermissionCheck = async (userId: string, permission: string) => {
  const cached = await getCachedPermission(userId, permission);
  if (cached !== null) return cached;
  
  return await checkPermissionFromDatabase(userId, permission);
};
```

**4. Audit Log Storage Growth**

*Problem:* Audit logs consuming excessive database storage

*Solutions:*
```typescript
// Implement log rotation
const auditConfig = {
  retentionDays: 365, // Keep for 1 year
  archiveAfterDays: 90, // Archive old logs
  compressionEnabled: true,
  
  // Archive to external storage
  archiveConfig: {
    provider: "s3",
    bucket: "audit-logs-archive",
    compression: "gzip"
  }
};

// Implement log level filtering
const logConfig = {
  auditLevel: "important", // basic | important | all
  excludeActions: ["PERMISSION_CHECK"], // Exclude noisy actions
  includeActions: ["ROLE_ASSIGNED", "ROLE_REMOVED", "PERMISSION_GRANTED"]
};
```

### Debugging Tools

**1. Enable Debug Logging**
```typescript
const auth = betterAuth({
  // ... other config
  debug: process.env.NODE_ENV === "development",
  logger: {
    level: "debug",
    rbac: true // Enable RBAC-specific logging
  }
});
```

**2. Permission Check Tracing**
```typescript
const tracePermissionCheck = async (userId: string, permission: string) => {
  console.log(`Checking permission ${permission} for user ${userId}`);
  
  const memberRoles = await getUserRoles(userId);
  console.log(`User has roles:`, memberRoles.map(r => r.name));
  
  for (const role of memberRoles) {
    const rolePermissions = await getRolePermissions(role.id);
    console.log(`Role ${role.name} has permissions:`, rolePermissions.map(p => p.name));
  }
  
  const result = await checkPermission({ userId, permission });
  console.log(`Permission check result: ${result}`);
  
  return result;
};
```

**3. Role Hierarchy Visualization**
```typescript
const visualizeRoleHierarchy = async (organizationId: string) => {
  const roles = await getRoleHierarchy(organizationId);
  
  const buildTree = (roles: Role[], parentId: string | null = null, depth = 0) => {
    const children = roles.filter(r => r.parentRoleId === parentId);
    return children.map(role => ({
      ...role,
      depth,
      children: buildTree(roles, role.id, depth + 1)
    }));
  };
  
  return buildTree(roles);
};
```

## 🔄 Migration Guide

### Migrating from Basic Organization Plugin

If you're upgrading from the basic organization plugin to RBAC:

**1. Update Configuration**
```typescript
// Before: Basic organization plugin
import { organization } from "better-auth/plugins/organization";

const auth = betterAuth({
  plugins: [organization()]
});

// After: RBAC organization plugin
import { organizationRbac } from "better-auth/plugins/organization";

const auth = betterAuth({
  plugins: [
    organizationRbac({
      rbac: {
        enabled: true,
        // ... RBAC configuration
      }
    })
  ]
});
```

**2. Run Database Migration**
```bash
# Run automatic migration
npx better-auth migrate

# Or run specific RBAC migration
npx better-auth migrate --plugin rbac
```

**3. Migrate Existing Role Data**
```typescript
// Migration script for existing roles
const migrateExistingRoles = async () => {
  const existingMembers = await db.findMany({
    model: "organizationMember",
    where: { role: { not: null } }
  });
  
  for (const member of existingMembers) {
    // Create role if it doesn't exist
    let role = await findRoleByName(member.role, member.organizationId);
    if (!role) {
      role = await createRole({
        name: member.role,
        organizationId: member.organizationId,
        level: getRoleLevelFromName(member.role)
      });
    }
    
    // Assign role to user
    await assignRoleToUser({
      userId: member.userId,
      roleId: role.id,
      organizationId: member.organizationId,
      assignedBy: "migration-script"
    });
  }
};
```

### Upgrading Between RBAC Versions

**Version 1.0 to 2.0:**
- Schema name changes: `rbac_role` → `role`
- Updated type exports
- New conditional permission features

```typescript
// Update imports
// Before
import type { RbacRole, RbacPermission } from "better-auth/plugins/organization";

// After  
import type { Role, Permission } from "better-auth/plugins/organization";

// Update database queries
// Before
const roles = await db.findMany({ model: "rbacRole" });

// After
const roles = await db.findMany({ model: "role" });
```

**Migration Script:**
```typescript
const migrateSchemaNames = async () => {
  // Rename tables (PostgreSQL example)
  await db.query('ALTER TABLE rbac_role RENAME TO role');
  await db.query('ALTER TABLE rbac_permission RENAME TO permission');
  await db.query('ALTER TABLE rbac_role_permission RENAME TO role_permission');
  await db.query('ALTER TABLE rbac_user_role RENAME TO user_role');
  await db.query('ALTER TABLE rbac_resource RENAME TO resource');
  await db.query('ALTER TABLE rbac_audit_log RENAME TO audit_log');
  await db.query('ALTER TABLE rbac_policy RENAME TO policy');
};
```

## 🔧 Advanced Integration Patterns

### Middleware Integration

Create custom middleware to enforce permissions at the API level:

```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const hasPermission = await auth.api.hasPermission({
        userId: session.user.id,
        organizationId: req.params.orgId,
        permission,
        resource: req.params.resourceId
      });

      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = session.user;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Usage in routes
app.get('/api/orgs/:orgId/projects', 
  requirePermission('project:read'), 
  getProjects
);

app.post('/api/orgs/:orgId/projects', 
  requirePermission('project:create'), 
  createProject
);
```

### Database-Level Security with Row-Level Security (RLS)

For PostgreSQL, combine RBAC with Row-Level Security:

```sql
-- Enable RLS on sensitive tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create policy that checks RBAC permissions
CREATE POLICY project_access_policy ON projects
  USING (
    EXISTS (
      SELECT 1 FROM user_role ur
      JOIN role_permission rp ON ur.role_id = rp.role_id
      JOIN permission p ON rp.permission_id = p.id
      WHERE ur.user_id = current_user_id()
        AND ur.organization_id = projects.organization_id
        AND (p.name = 'project:read' OR p.name = 'project:*')
    )
  );
```

### GraphQL Integration

Integrate RBAC with GraphQL resolvers:

```typescript
// graphql/resolvers.ts
import { GraphQLResolveInfo } from 'graphql';
import { auth } from '../lib/auth';

const requirePermission = (permission: string) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const [, , context] = args;
      
      const hasPermission = await auth.api.hasPermission({
        userId: context.user.id,
        organizationId: context.organizationId,
        permission
      });

      if (!hasPermission) {
        throw new Error('Insufficient permissions');
      }

      return method.apply(this, args);
    };
  };
};

class ProjectResolver {
  @requirePermission('project:read')
  async getProjects(parent: any, args: any, context: any) {
    return await db.project.findMany({
      where: { organizationId: context.organizationId }
    });
  }

  @requirePermission('project:create')
  async createProject(parent: any, args: any, context: any) {
    return await db.project.create({
      data: { ...args.input, organizationId: context.organizationId }
    });
  }
}
```

### React Hook Integration

Create custom hooks for seamless frontend integration:

```typescript
// hooks/useRBAC.ts
import { useAuth } from '@better-auth/react';
import { useState, useEffect } from 'react';

export const usePermission = (permission: string, resourceId?: string) => {
  const { data: session } = useAuth();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      if (!session?.user) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      try {
        const result = await fetch('/api/auth/check-permission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permission, resourceId })
        });
        
        const { hasPermission: permitted } = await result.json();
        setHasPermission(permitted);
      } catch (error) {
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [permission, resourceId, session]);

  return { hasPermission, loading };
};

// Usage in components
const ProjectActions = ({ projectId }: { projectId: string }) => {
  const { hasPermission: canEdit } = usePermission('project:update', projectId);
  const { hasPermission: canDelete } = usePermission('project:delete', projectId);

  return (
    <div>
      {canEdit && <button>Edit Project</button>}
      {canDelete && <button>Delete Project</button>}
    </div>
  );
};
```

## 📊 Performance Optimization

### Caching Strategies

```typescript
// Advanced caching configuration
const auth = betterAuth({
  plugins: [
    organizationRbac({
      rbac: {
        enabled: true,
        // Multi-level caching
        cache: {
          permissions: {
            ttl: 300, // 5 minutes
            maxSize: 10000
          },
          roles: {
            ttl: 600, // 10 minutes
            maxSize: 5000
          },
          memberRoles: {
            ttl: 180, // 3 minutes
            maxSize: 50000
          }
        },
        
        // Preload common permissions
        preloadPermissions: [
          'organization:read',
          'member:read',
          'project:read'
        ]
      }
    })
  ]
});
```

### Database Indexing

Optimize your database with proper indexes:

```sql
-- Essential indexes for RBAC performance
CREATE INDEX idx_user_role_user_org ON user_role(user_id, organization_id);
CREATE INDEX idx_user_role_org_user ON user_role(organization_id, user_id);
CREATE INDEX idx_role_permission_role ON role_permission(role_id);
CREATE INDEX idx_permission_name ON permission(name);
CREATE INDEX idx_role_level ON role(level, organization_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_user_org ON audit_log(user_id, organization_id);

-- Composite indexes for complex queries
CREATE INDEX idx_user_role_active ON user_role(user_id, organization_id, is_active, expires_at);
CREATE INDEX idx_permission_resource ON permission(resource_type, action);
```

### Bulk Operations

For high-performance bulk operations:

```typescript
// Bulk role assignments
const bulkAssignRoles = async (assignments: RoleAssignment[]) => {
  // Use transactions for consistency
  return await db.transaction(async (tx) => {
    // Batch insert user roles
    const userRoles = assignments.map(assignment => ({
      userId: assignment.userId,
      roleId: assignment.roleId,
      organizationId: assignment.organizationId,
      assignedBy: assignment.assignedBy,
      assignedAt: new Date()
    }));

    await tx.userRole.createMany({
      data: userRoles,
      skipDuplicates: true
    });

    // Batch create audit logs
    const auditLogs = assignments.map(assignment => ({
      action: 'role:assign',
      resourceType: 'user_role',
      userId: assignment.assignedBy,
      organizationId: assignment.organizationId,
      details: { 
        assignedUserId: assignment.userId, 
        roleId: assignment.roleId 
      }
    }));

    await tx.auditLog.createMany({
      data: auditLogs
    });
  });
};
```

## 🔍 Monitoring and Analytics

### Audit Log Analysis

```typescript
// Generate security reports
const generateSecurityReport = async (organizationId: string, days: number = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const auditLogs = await db.auditLog.findMany({
    where: {
      organizationId,
      timestamp: { gte: startDate }
    },
    orderBy: { timestamp: 'desc' }
  });

  const report = {
    totalActions: auditLogs.length,
    actionsByType: auditLogs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    activeUsers: new Set(auditLogs.map(log => log.userId)).size,
    suspiciousActivity: auditLogs.filter(log => 
      log.action.includes('delete') || 
      log.action.includes('admin')
    ).length,
    topUsers: Object.entries(
      auditLogs.reduce((acc, log) => {
        acc[log.userId] = (acc[log.userId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).sort(([,a], [,b]) => b - a).slice(0, 10)
  };

  return report;
};
```

### Performance Metrics

```typescript
// Track RBAC performance
const trackPermissionCheck = async (
  operation: string, 
  duration: number, 
  cacheHit: boolean
) => {
  // Log to your monitoring service
  console.log(`RBAC ${operation}: ${duration}ms (cache: ${cacheHit ? 'HIT' : 'MISS'})`);
  
  // Send to monitoring service (DataDog, New Relic, etc.)
  if (process.env.NODE_ENV === 'production') {
    await metrics.increment('rbac.permission_check', 1, {
      operation,
      cache_hit: cacheHit.toString(),
      duration_bucket: duration < 10 ? 'fast' : duration < 100 ? 'medium' : 'slow'
    });
  }
};
```

## 🧪 Testing Strategies

### Unit Testing RBAC Logic

```typescript
// tests/rbac.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestAuth } from './helpers/auth';

describe('RBAC Permission System', () => {
  let auth: ReturnType<typeof createTestAuth>;
  let testOrg: any;
  let testUser: any;

  beforeEach(async () => {
    auth = createTestAuth();
    testOrg = await auth.api.createOrganization({ name: 'Test Org' });
    testUser = await auth.api.createUser({ email: 'test@example.com' });
  });

  it('should grant permissions based on role hierarchy', async () => {
    // Create roles with hierarchy
    const adminRole = await auth.api.createRole({
      name: 'Admin',
      level: 10,
      organizationId: testOrg.id,
      permissions: ['user:*', 'project:*']
    });

    const userRole = await auth.api.createRole({
      name: 'User', 
      level: 5,
      organizationId: testOrg.id,
      permissions: ['project:read']
    });

    // Assign lower-level role
    await auth.api.assignRoleToUser({
      userId: testUser.id,
      roleId: userRole.id,
      organizationId: testOrg.id
    });

    // Check permission inheritance
    const hasReadPermission = await auth.api.hasPermission({
      userId: testUser.id,
      organizationId: testOrg.id,
      permission: 'project:read'
    });

    const hasDeletePermission = await auth.api.hasPermission({
      userId: testUser.id,
      organizationId: testOrg.id,
      permission: 'project:delete'
    });

    expect(hasReadPermission).toBe(true);
    expect(hasDeletePermission).toBe(false);
  });

  it('should enforce conditional permissions', async () => {
    const role = await auth.api.createRole({
      name: 'Time-Limited Admin',
      organizationId: testOrg.id,
      permissions: [{
        name: 'admin:*',
        conditions: {
          timeRange: {
            start: '09:00',
            end: '17:00',
            timezone: 'UTC'
          }
        }
      }]
    });

    await auth.api.assignRoleToUser({
      userId: testUser.id,
      roleId: role.id,
      organizationId: testOrg.id
    });

    // Mock time within business hours
    const businessHours = new Date();
    businessHours.setUTCHours(14, 0, 0, 0); // 2 PM UTC
    
    const hasPermissionDuringBusinessHours = await auth.api.hasPermission({
      userId: testUser.id,
      organizationId: testOrg.id,
      permission: 'admin:delete',
      context: { currentTime: businessHours }
    });

    expect(hasPermissionDuringBusinessHours).toBe(true);
  });
});
```

### Integration Testing

```typescript
// tests/rbac-integration.test.ts
import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from './helpers/setup';

describe('RBAC API Integration', () => {
  it('should handle complex permission scenarios', async () => {
    const { auth, request } = await setupTestEnvironment();

    // Create organization and users
    const org = await auth.api.createOrganization({ name: 'Tech Corp' });
    const admin = await auth.api.createUser({ email: 'admin@techcorp.com' });
    const manager = await auth.api.createUser({ email: 'manager@techcorp.com' });
    const developer = await auth.api.createUser({ email: 'dev@techcorp.com' });

    // Set up role hierarchy
    await setupRoleHierarchy(auth, org.id);

    // Test API endpoints with different roles
    const adminSession = await auth.api.signIn({ email: 'admin@techcorp.com' });
    const managerSession = await auth.api.signIn({ email: 'manager@techcorp.com' });

    // Admin can create projects
    const adminResponse = await request
      .post(`/api/orgs/${org.id}/projects`)
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({ name: 'New Project' });
    
    expect(adminResponse.status).toBe(201);

    // Manager cannot delete the organization
    const managerResponse = await request
      .delete(`/api/orgs/${org.id}`)
      .set('Authorization', `Bearer ${managerSession.token}`);
    
    expect(managerResponse.status).toBe(403);
  });
});
```

## 🔐 Security Considerations

### Input Validation

```typescript
// Validate permission names
const validatePermissionName = (permission: string): boolean => {
  const permissionRegex = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_*]*$/;
  return permissionRegex.test(permission);
};

// Validate role levels
const validateRoleLevel = (level: number): boolean => {
  return Number.isInteger(level) && level >= 0 && level <= 100;
};

// Sanitize audit log data
const sanitizeAuditData = (data: any): any => {
  const sanitized = { ...data };
  
  // Remove sensitive information
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  
  // Truncate large fields
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
      sanitized[key] = sanitized[key].substring(0, 1000) + '...';
    }
  });
  
  return sanitized;
};
```

### Rate Limiting

```typescript
// Implement rate limiting for sensitive operations
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (userId: string, action: string, maxAttempts: number = 10) => {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  
  const current = rateLimiter.get(key);
  
  if (!current || now > current.resetTime) {
    rateLimiter.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (current.count >= maxAttempts) {
    throw new Error(`Rate limit exceeded for ${action}`);
  }
  
  current.count++;
  return true;
};

// Usage in RBAC operations
const assignRoleToUser = async (params: AssignRoleParams) => {
  await checkRateLimit(params.assignedBy, 'role:assign', 50);
  // ... rest of the implementation
};
```

### Encryption and Secrets

```typescript
// Encrypt sensitive audit log data
import crypto from 'crypto';

const encryptSensitiveData = (data: string, key: Buffer): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipherGCM('aes-256-gcm', key);
  cipher.setAAD(Buffer.from('additional-data'));
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
};

const decryptSensitiveData = (encryptedData: string, key: Buffer): string => {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipherGCM('aes-256-gcm', key);
  decipher.setAAD(Buffer.from('additional-data'));
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Generate secure key
const generateEncryptionKey = (): Buffer => {
  return crypto.randomBytes(32); // 256-bit key
};
```

## Contributing

We welcome contributions to improve the RBAC plugin! Here's how you can help:

### Development Setup

1. **Fork and Clone**: Fork the Better Auth repository and clone it locally
2. **Install Dependencies**: Run `pnpm install` in the root directory
3. **Run Tests**: Use `pnpm test` to run the test suite
4. **Development Server**: Start the development environment with `pnpm dev`

### Contribution Guidelines

- **Follow TypeScript**: All code must be fully typed
- **Write Tests**: Include comprehensive tests for new features
- **Update Documentation**: Update README and code comments
- **Performance**: Consider performance implications of changes
- **Security**: Follow security best practices

### Reporting Issues

- **Bug Reports**: Include reproduction steps and environment details
- **Feature Requests**: Describe the use case and expected behavior
- **Security Issues**: Report privately to the maintainers

## License

MIT License - see the [Better Auth project](https://github.com/better-auth/better-auth) for details.
