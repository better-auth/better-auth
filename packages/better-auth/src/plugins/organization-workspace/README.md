# @scrydon/workspace

A workspace plugin for Better Auth that adds workspaces as sub-entities under organizations with role-based permissions.

## ✨ Features

- 🏢 **Workspaces under Organizations** - Hierarchical structure with proper isolation
- 🔐 **Role-Based Permissions** - Granular access control for all operations
- 👥 **Member Management** - Add, remove, and manage workspace members
- 🎯 **Active Workspace** - Session-based active workspace tracking
- 🚀 **Auto-Creation** - Automatically create default workspace for new organizations
- 🏗️ **Team Support** - Add entire teams to workspaces (requires organization teams)
- 📱 **Full TypeScript** - Complete type safety and inference

## 📦 Installation

```bash
npm install @scrydon/workspace
# or
bun add @scrydon/workspace
```

## 🚀 Quick Start

### 1. Server Setup

```typescript
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { workspace } from "@scrydon/workspace";

export const auth = betterAuth({
  database: yourDatabase,
  plugins: [
    organization(),
    workspace(), // Creates "General" workspace automatically for new orgs
  ],
});
```

### 2. Client Setup

```typescript
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import { workspaceClient } from "@scrydon/workspace/client";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [organizationClient(), workspaceClient()],
});
```

### 3. Basic Usage

```typescript
// Create workspace (org owners/admins only)
const workspace = await authClient.workspace.create({
  name: "Development Team",
  description: "Our dev workspace",
  organizationId: "org-123",
});

// Add member to workspace
await authClient.workspace.addMember({
  workspaceId: workspace.data.id,
  userId: "user-456",
  role: "admin",
});

// List workspaces
const workspaces = await authClient.workspace.list({
  organizationId: "org-123",
});
```

## 🏗️ Permission System

### Roles & Capabilities

| Role | Create Workspace | Manage Members | Delete Workspace | Access Workspace |
|------|------------------|----------------|------------------|------------------|
| **Org Owner** | ✅ | ✅ | ✅ | ✅ |
| **Org Admin** | ✅ | ✅ | ✅ | ✅ |
| **Org Member** | ❌ | ❌ | ❌ | Only if workspace member |
| **Workspace Admin** | - | ✅ | ❌ | ✅ |
| **Workspace Member** | - | ❌ | ❌ | ✅ |

### Key Permission Rules

- **Organization-level**: Controls workspace creation and organization-wide access
- **Workspace-level**: Controls member management within specific workspaces
- **Self-modification**: Users cannot change their own roles (security boundary)
- **Last owner**: Cannot remove the last owner from a workspace

## 🌐 Full Organization Usage Example

Here's how the workspace plugin handles complex multi-organization scenarios:

### Organizational Structure

```
Organizations
├─ Acme Corp (Alice's Company)
│  ├─ Members
│  │  ├─ Alice (owner) - Can do everything
│  │  ├─ Bob (admin) - Can manage workspaces
│  │  ├─ Carol (member) - Read-only
│  │  └─ Dave (member) - Read-only
│  └─ Workspaces
│     ├─ General (auto-created)
│     │  └─ Alice (owner)
│     └─ Development Team
│        ├─ Alice (owner)
│        ├─ Bob (admin) - Can manage members
│        └─ Carol (member) - Read access
│
└─ StartupXYZ (Eva's Company)
   ├─ Members
   │  ├─ Eva (owner) - Can do everything
   │  ├─ Frank (admin) - Can manage workspaces
   │  ├─ Carol (admin) - CROSS-ORG: Admin here, member in Acme
   │  └─ Grace (member) - Read-only
   └─ Workspaces
      └─ Product Team
         ├─ Eva (owner)
         ├─ Carol (admin) - Can manage members here
         └─ Grace (member) - Read access
```

### Usage Scenarios

```typescript
// 1. Alice creates workspace in Acme Corp
await authClient.signIn.email({ email: "alice@acme.com", password: "***" });
const devWorkspace = await authClient.workspace.create({
  name: "Development Team",
  organizationId: "acme-corp-id",
});

// 2. Alice adds team members
await authClient.workspace.addMember({
  workspaceId: devWorkspace.data.id,
  userId: "bob-id",
  role: "admin", // Bob can now manage this workspace
});

await authClient.workspace.addMember({
  workspaceId: devWorkspace.data.id,
  userId: "carol-id", 
  role: "member",
});

// 3. Bob (workspace admin) can manage members
await authClient.signIn.email({ email: "bob@acme.com", password: "***" });
await authClient.workspace.updateMemberRole({
  workspaceId: devWorkspace.data.id,
  userId: "carol-id",
  role: "admin", // Promote Carol
});

// 4. Carol (cross-org user) works in different contexts
await authClient.signIn.email({ email: "carol@example.com", password: "***" });

// In Acme Corp - she's a workspace admin
const acmeWorkspaces = await authClient.workspace.list({
  organizationId: "acme-corp-id", // She can see workspaces she's part of
});

// In StartupXYZ - she's an org admin
const startupWorkspace = await authClient.workspace.create({
  name: "Product Team",
  organizationId: "startup-xyz-id", // She can create workspaces here
});

// 5. Permission boundaries are enforced
await authClient.signIn.email({ email: "dave@acme.com", password: "***" });
try {
  await authClient.workspace.create({
    name: "Should Fail",
    organizationId: "acme-corp-id", // ❌ Dave is org member, can't create
  });
} catch (error) {
  console.log("Permission denied - as expected!");
}
```

## 📚 API Reference

### Workspace Operations

```typescript
// Create workspace
await authClient.workspace.create({
  name: string,
  description?: string,
  organizationId: string,
});

// Update workspace  
await authClient.workspace.update({
  workspaceId: string,
  name?: string,
  description?: string,
});

// Delete workspace
await authClient.workspace.delete({
  workspaceId: string,
});

// List workspaces
await authClient.workspace.list({
  organizationId?: string, // Filter by org
});

// Get workspace details
await authClient.workspace.get({
  workspaceId: string,
});
```

### Member Management

```typescript
// Add member
await authClient.workspace.addMember({
  workspaceId: string,
  userId: string,
  role: "owner" | "admin" | "member",
});

// Remove member
await authClient.workspace.removeMember({
  workspaceId: string,
  userId: string,
});

// Update member role
await authClient.workspace.updateMemberRole({
  workspaceId: string,
  userId: string,
  role: "owner" | "admin" | "member",
});

// List members
await authClient.workspace.listMembers({
  workspaceId: string,
});
```

### Team Management (Optional)

> **Note**: Team functionality requires the Better Auth organization plugin with teams enabled: `organization({ allowTeams: true })`

```typescript
// Add team to workspace
await authClient.workspace.addTeamMember({
  workspaceId: string,
  teamId: string,
  role: "owner" | "admin" | "member",
});

// Remove team from workspace
await authClient.workspace.removeTeamMember({
  workspaceId: string,
  teamId: string,
});

// Update team role in workspace
await authClient.workspace.updateTeamMemberRole({
  workspaceId: string,
  teamId: string,
  role: "owner" | "admin" | "member",
});

// List teams in workspace
await authClient.workspace.listTeamMembers({
  workspaceId: string,
});
```

### Active Workspace

```typescript
// Set active workspace
await authClient.workspace.setActive({
  workspaceId: string,
});
```

## ⚙️ Configuration

### Basic Configuration

```typescript
workspace({
  // Auto-create workspace for new organizations
  createDefaultWorkspace: true, // default: true
  defaultWorkspaceName: "General", // default: "General"
})
```

### Advanced Configuration

```typescript
workspace({
  // Custom schema fields
  schema: {
    workspace: {
      additionalFields: {
        settings: { type: "string" },
        theme: { type: "string" },
      },
    },
  },
  
  // Lifecycle hooks
  workspaceHooks: {
    afterCreateWorkspace: async ({ workspace, user }) => {
      await sendNotification(user.email, `Workspace ${workspace.name} created`);
    },
    
    afterAddWorkspaceMember: async ({ member, workspace }) => {
      await provisionAccess(member.userId, workspace.id);
    },
  },
})
```

## 🗄️ Database Schema

The plugin adds these tables:

```sql
-- Workspaces table
CREATE TABLE workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  organization_id TEXT NOT NULL REFERENCES organization(id),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

-- Workspace members table
CREATE TABLE workspace_member (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  role TEXT NOT NULL DEFAULT 'member',
  created_at DATETIME NOT NULL,
  UNIQUE(workspace_id, user_id)
);

-- Workspace team members table (optional - requires organization teams)
CREATE TABLE workspace_team_member (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  team_id TEXT NOT NULL REFERENCES team(id),
  role TEXT NOT NULL DEFAULT 'member',
  created_at DATETIME NOT NULL,
  UNIQUE(workspace_id, team_id)
);

-- Extends session table
ALTER TABLE session ADD COLUMN active_workspace_id TEXT REFERENCES workspace(id);
```

## 🧪 Testing

The plugin includes comprehensive tests covering all functionality:

### Test Coverage
- ✅ **Basic CRUD Operations** - Create, read, update, delete workspaces
- ✅ **Member Management** - Add, remove, update member roles
- ✅ **Team Management** - Add teams to workspaces (with proper organization teams setup)
- ✅ **Permission Validation** - All role-based access controls
- ✅ **Cross-Organization Scenarios** - Complex multi-org setups
- ✅ **Security Boundaries** - Self-modification prevention, permission isolation

### E2E Test Highlights
- **8 users** across **2 organizations** with cross-org memberships
- **13 comprehensive phases** covering all user stories
- **106 assertions** validating complete functionality
- **1.7 second runtime** despite complexity
- **Real-world scenarios** with enterprise-grade permission hierarchies

```bash
# Run all tests
bun test

# Run E2E test specifically
bun test --testNamePattern="multi-organization workspace scenarios"
```

### Test Scenarios Validated

#### ✅ Organization-Level Permissions
- Org owners can create/delete/update workspaces
- Org admins can create/delete/update workspaces
- Org members cannot create/delete/update workspaces
- Proper workspace visibility based on membership

#### ✅ Workspace-Level Permissions  
- Workspace owners/admins can manage members
- Workspace members have read-only access
- Role updates work correctly with proper authorization
- Self-role modification is prevented

#### ✅ Cross-Organization Scenarios
- Users can have different roles across organizations
- Permissions are properly scoped to organization context
- Cross-org admins have correct capabilities in each context

#### ✅ Security Boundaries
- Permission escalation prevention
- Proper access revocation on membership removal
- Last owner protection (cannot remove last workspace owner)

## 🔧 Migration & Deployment

### Database Migration

The plugin automatically creates necessary tables when Better Auth initializes. For production deployments:

1. **Run migrations** in your deployment pipeline
2. **Set up indexes** for performance:
   ```sql
   CREATE INDEX idx_workspace_org ON workspace(organization_id);
   CREATE INDEX idx_workspace_member_workspace ON workspace_member(workspace_id);
   CREATE INDEX idx_workspace_member_user ON workspace_member(user_id);
   ```

### Environment Variables

```bash
# Optional: Configure default workspace behavior
WORKSPACE_AUTO_CREATE=true
WORKSPACE_DEFAULT_NAME="General"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and add tests
4. Run tests: `bun test`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- 📖 **Documentation**: This README and inline code documentation
- 🐛 **Issues**: GitHub Issues for bugs and feature requests
- 💬 **Discussions**: GitHub Discussions for questions and community support

---

Built with ❤️ for the Better Auth ecosystem
  
```

## Database Schema

The plugin adds these tables to your database:

### workspace
```sql
CREATE TABLE workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  metadata TEXT, -- JSON string
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

### workspace_member
```sql
CREATE TABLE workspace_member (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at DATETIME NOT NULL,
  UNIQUE(workspace_id, user_id)
);
```

### session (extension)
```sql
-- Adds to existing session table
ALTER TABLE session ADD COLUMN active_workspace_id TEXT REFERENCES workspace(id) ON DELETE SET NULL;
```

## Hooks and Customization

### Lifecycle Hooks

```typescript
workspace({
  workspaceHooks: {
    beforeCreateWorkspace: async ({ workspace, organization, user }) => {
      // Custom validation or data transformation
      return { data: { customField: "value" } };
    },
    
    afterCreateWorkspace: async ({ workspace, organization, user }) => {
      // Send notifications, create default resources, etc.
      await sendNotification(user.email, "Workspace created");
    },
    
    afterAddWorkspaceMember: async ({ member, workspace, user }) => {
      // Send welcome email, provision access, etc.
      await provisionUserAccess(user.id, workspace.id);
    },
  },
});
```

### Custom Schema Fields

```typescript
workspace({
  schema: {
    workspace: {
      additionalFields: {
        settings: { type: "string" },
        theme: { type: "string", defaultValue: "light" },
      },
    },
    workspaceMember: {
      additionalFields: {
        joinedVia: { type: "string" },
        permissions: { type: "string" },
      },
    },
  },
});
```

## Advanced Usage

### Custom Access Control

```typescript
import { createAccessControl } from "better-auth/plugins";

const customAC = createAccessControl([
  "workspace:create",
  "workspace:read", 
  "workspace:update",
  "workspace:delete",
  "workspace:manage-settings",
  "workspace-member:add",
  "workspace-member:remove",
  "workspace-member:update-role",
] as const);

const customRoles = {
  owner: customAC.newRole([
    "workspace:create",
    "workspace:read",
    "workspace:update", 
    "workspace:delete",
    "workspace:manage-settings",
    "workspace-member:add",
    "workspace-member:remove",
    "workspace-member:update-role",
  ]),
  // ... other roles
};

workspace({
  ac: customAC,
  roles: customRoles,
});
```

### Permission Checking (Client)

```typescript
// Check if current user can perform action
const canCreateWorkspace = authClient.workspace.checkRolePermission({
  role: "admin",
  permissions: { workspace: ["create"] },
});

if (canCreateWorkspace) {
  // Show create workspace UI
}
```

## API Reference

### Server Endpoints

All endpoints are automatically added to your Better Auth server:

- `POST /workspace/create` - Create workspace
- `GET /workspace/get` - Get workspace details  
- `POST /workspace/update` - Update workspace
- `POST /workspace/delete` - Delete workspace
- `GET /workspace/list` - List workspaces
- `POST /workspace/set-active` - Set active workspace
- `POST /workspace/add-member` - Add workspace member
- `POST /workspace/remove-member` - Remove workspace member
- `POST /workspace/update-member-role` - Update member role
- `GET /workspace/list-members` - List workspace members

### Client Methods

All client methods are typed and include error handling:

```typescript
// All methods return { data, error } format
const result = await authClient.workspace.createWorkspace({...});

if (result.error) {
  console.error("Error:", result.error.message);
} else {
  console.log("Success:", result.data);
}
```

## Error Handling

The plugin provides comprehensive error codes:

```typescript
const WORKSPACE_ERROR_CODES = {
  WORKSPACE_NOT_FOUND: "Workspace not found",
  NO_ACTIVE_WORKSPACE: "No active workspace found", 
  USER_NOT_WORKSPACE_MEMBER: "User is not a member of this workspace",
  INSUFFICIENT_PERMISSIONS: "Insufficient permissions to perform this action",
  WORKSPACE_SLUG_TAKEN: "Workspace slug is already taken",
  CANNOT_REMOVE_LAST_OWNER: "Cannot remove the last owner from workspace",
  CANNOT_MODIFY_OWN_ROLE: "Cannot modify your own role",
  // ... more error codes
};
```

## Testing

### Comprehensive Test Suite

The workspace plugin includes a comprehensive test suite with 11 test cases covering:

- ✅ **Basic CRUD Operations**: Create, read, update, delete workspaces
- ✅ **Member Management**: Add, remove, and manage workspace members  
- ✅ **Role Management**: Update member roles with proper permissions
- ✅ **Auto Workspace Creation**: Automatic workspace creation on organization setup
- ✅ **Permission Checking**: Validates role-based permission system

### E2E Multi-Organization Test

The plugin includes an extensive **End-to-End test** that validates the complete workspace functionality across a complex multi-organization hierarchy:

**Key Features Tested**:
- 8 users across 2 organizations with cross-org memberships
- Complex permission hierarchies (org owner/admin/member + workspace owner/admin/member)
- 13 comprehensive test phases covering all user stories
- Security boundary testing (self-role modification prevention, permission revocation)
- Cross-organization scenarios with proper permission scoping

**Test Performance**:
- ⚡ Completes in ~1.7 seconds despite complexity
- 🔍 106 comprehensive assertion calls
- 🛡️ Validates all security boundaries and edge cases

For detailed documentation of the E2E test, see: [E2E_TEST_DOCUMENTATION.md](./E2E_TEST_DOCUMENTATION.md)

### Running Tests

```bash
# Run all tests
bun test

# Run only the E2E test
bun test --testNamePattern="should handle complex multi-organization workspace scenarios"

# Run with verbose output  
bun test --verbose
```

## Migration Guide

If you have existing workspace data, you can migrate using Better Auth's migration system:

```bash
npx better-auth migrate
```

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- [Documentation](https://github.com/scrydon/main/tree/main/packages/workspace)
- [Issues](https://github.com/scrydon/main/issues)
- [Discussions](https://github.com/scrydon/main/discussions)
