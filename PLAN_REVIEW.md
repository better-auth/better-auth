# Refactoring Plan Review - Issues & Recommendations

## Critical Issues

### 1. **Role Type Uniqueness - CLARIFIED** ✅ RESOLVED

**Clarification:**
- Role types are unique identifiers (like slugs) per resource
- "Engineering Admin" → type: `"engineering_admin"`
- "Sales Admin" → type: `"sales_admin"`
- These are different types, so no collision
- If two roles need same permissions, they can have different types but same permissions
- Unique constraint on `(organization_id, type)` is correct

**Current Design is Correct:**
- ✅ `type` is unique per resource (like a slug/identifier)
- ✅ Junction tables store `role_type` (correct approach)
- ✅ No need for `role_id` in junction tables since type is unique
- ✅ Multiple roles can share permissions via Zed schema, but have different types
- ✅ Example: "engineering_admin" and "sales_admin" can have same permissions but different types

**Recommendation:**
- Ensure unique constraint: `UNIQUE(organization_id, type)` is enforced
- Document that role types are like slugs - unique identifiers derived from role names
- Built-in roles use reserved types: "owner", "admin", "member" (cannot be reused)
- Document that permissions are separate from types - multiple types can share permissions

---

### 2. **Invitation Schema Inconsistency** ⚠️ CRITICAL

**Problem:**
- Line 97-98: `organization_role_ids` (array of IDs)
- Line 374: `organizationRoleTypes` (array of strings)
- These are inconsistent - invitations should use role types, not IDs

**Recommendation:**
- Change invitation schema to use `organizationRoleTypes: string[]` and `teamRoleTypes: string[]`
- Remove `organization_role_ids` and `team_role_ids` from invitation table
- When accepting invitation, look up role IDs from types

**Impact:** High - Schema inconsistency will cause bugs

---

### 3. **Missing Unique Constraints** ⚠️ HIGH

**Problem:**
- Plan mentions uniqueness but doesn't explicitly state unique constraints
- Need to ensure database enforces `(organization_id, type)` uniqueness
- What prevents creating duplicate built-in roles?
- What prevents creating custom role with same type as built-in?

**Recommendation:**
- **Explicitly add unique constraint**: `UNIQUE(organization_id, type)` for organization_roles
- **Explicitly add unique constraint**: `UNIQUE(team_id, type)` for team_roles  
- **Explicitly add unique constraint**: `UNIQUE(platform_id, type)` for platform_roles
- This ensures one role per type per resource (type is unique identifier)
- Built-in roles are created first with reserved types ("owner", "admin", "member"), preventing custom roles from using same types
- Document reserved built-in role types that cannot be used for custom roles

**Impact:** High - Data integrity issue

---

### 4. **Role Type Validation on Assignment** ⚠️ HIGH

**Problem:**
- When assigning `roleTypes` to a member, what if the role type doesn't exist?
- What if a custom role was deleted but junction table still references it?
- No validation strategy specified

**Recommendation:**
- Validate role types exist before assignment
- When assigning roles, verify `(organization_id, role_type)` exists in `organization_roles` table
- Return clear error: "Role type 'admin' does not exist for this organization"
- Consider soft-delete for roles (mark as deleted, don't actually delete) to handle existing assignments

**Impact:** High - Runtime errors and data inconsistency

---

### 5. **Junction Table Redundancy** ⚠️ MEDIUM

**Problem:**
- `member_organization_roles` stores both `member_id` and `organization_id`
- But `member_id` already implies `organization_id` through member table
- This is redundant but might be intentional for performance

**Recommendation:**
- Keep `organization_id` for performance (avoids join to member table)
- Document this as intentional denormalization for query performance
- Add database constraint: `FOREIGN KEY (member_id, organization_id) REFERENCES member(id, organization_id)`

**Impact:** Medium - Performance vs normalization trade-off

---

## API Design Issues

### 6. **API Naming Inconsistency** ⚠️ MEDIUM

**Problem:**
- Mixed naming: `create-organization-role` vs `setPlatformRoles`
- Some use kebab-case, some use camelCase
- Inconsistent patterns

**Recommendation:**
- Use consistent kebab-case for all endpoints: `/organization/create-organization-role`
- Use consistent camelCase for request/response bodies: `organizationRoleTypes`
- Follow RESTful conventions:
  - `POST /organization/roles` - create role
  - `GET /organization/roles` - list roles
  - `GET /organization/roles/:id` - get role
  - `PATCH /organization/roles/:id` - update role
  - `DELETE /organization/roles/:id` - delete role

**Impact:** Medium - Developer experience and consistency

---

### 7. **Missing API Response Specifications** ⚠️ MEDIUM

**Problem:**
- Plan doesn't specify exact response structures
- Unclear what `listMembers` returns - just role types or full role objects?
- Unclear pagination, filtering, sorting

**Recommendation:**
- Specify exact response structures:
  ```typescript
  // GET /organization/list-members
  {
    members: Array<{
      id: string;
      userId: string;
      organizationId: string;
      roleTypes: string[]; // ["admin", "member"]
      roles?: Array<{ // optional, only if ?include=roles
        id: string;
        type: string;
        name: string;
        description?: string;
        isBuiltIn: boolean;
      }>;
      user: { id, name, email, image };
      createdAt: Date;
    }>;
    total: number;
    limit?: number;
    offset?: number;
  }
  ```

**Impact:** Medium - API clarity and developer experience

---

### 8. **Role Lookup Endpoint Missing** ⚠️ MEDIUM

**Problem:**
- Plan mentions lookup methods but no API endpoints
- How do clients get full role details when they have role types?

**Recommendation:**
- Add endpoint: `GET /organization/roles?types=admin,member`
- Returns full role objects for given types
- Supports batch lookup: `?types=admin,member,owner`

**Impact:** Medium - Missing functionality

---

## Enterprise Scalability Issues

### 9. **Team Role Scope Ambiguity** ⚠️ MEDIUM

**Problem:**
- Teams belong to organizations
- Are team roles scoped to organization or just team?
- Can same role type exist in different teams of same org?
- Plan doesn't clarify

**Recommendation:**
- Team roles are scoped to team (not organization)
- Same role type can exist in different teams
- Unique constraint: `UNIQUE(team_id, type)` (not organization_id)
- Document this clearly

**Impact:** Medium - Confusion in complex org structures

---

### 10. **Built-in Role Type Collision Prevention** ⚠️ MEDIUM

**Problem:**
- What prevents creating custom role with type "owner" (same as built-in)?
- Unique constraint on `(organization_id, type)` would prevent this
- But need to ensure built-in roles are created first
- Need to document reserved types

**Recommendation:**
- Enforce unique constraint: `UNIQUE(organization_id, type)`
- Built-in roles are created first (on org creation) with reserved types
- Document reserved built-in role types:
  - Organization: "owner", "admin", "member"
  - Team: "lead", "member"
  - Platform: "platform_admin", "platform_user"
- Custom role creation fails if type already exists (caught by unique constraint)
- Clear error: "Role type 'owner' already exists" or "Role type 'owner' is reserved"
- Consider adding validation to prevent using reserved types even if they don't exist yet

**Impact:** Medium - Data integrity

---

### 11. **Role Deletion Strategy** ⚠️ MEDIUM

**Problem:**
- What happens when a custom role is deleted?
- Junction tables still reference the role_type
- Orphaned references

**Recommendation:**
- **Option A**: Soft delete - mark role as deleted, don't actually delete
  - Add `deleted_at` field to role tables
  - Filter out deleted roles in queries
  - Allow "undelete" if needed

- **Option B**: Cascade delete - remove all junction table entries
  - Risky - users lose roles without warning
  - Need confirmation/audit trail

- **Option C**: Prevent deletion if role is in use
  - Check junction tables before deletion
  - Return error: "Cannot delete role: 5 members have this role"

**Recommendation:** Option C (prevent deletion) + Option A (soft delete) for safety

**Impact:** Medium - Data integrity and user experience

---

### 12. **Migration Edge Cases** ⚠️ LOW

**Problem:**
- What if existing `member.role` values don't match built-in role types?
- Example: existing role "super_admin" but built-in is "admin"
- Migration will fail or create invalid data

**Recommendation:**
- Migration script should:
  1. Map common role names to built-in types (e.g., "super_admin" → "admin")
  2. Create custom roles for unmapped types
  3. Log warnings for unmapped roles
  4. Provide migration report

**Impact:** Low - Migration complexity

---

## Abstraction Issues

### 13. **Role ID vs Role Type - CLARIFIED** ✅ RESOLVED

**Clarification:**
- Role `type` is unique per resource (like a slug)
- Role `id` is the primary key
- Junction tables correctly use `role_type` since it's unique
- No confusion - design is correct

**Current Design:**
- ✅ Junction tables store `role_type` (unique identifier)
- ✅ Can lookup role by `(resource_id, role_type)`
- ✅ No need for `role_id` in junction tables

**Recommendation:**
- Keep current design
- Document that `type` is the unique identifier per resource

---

### 14. **Permission Storage Redundancy** ⚠️ LOW

**Problem:**
- Roles have `permissions` field (Zed schema)
- But AuthZed also handles permissions
- Why store permissions in both places?

**Recommendation:**
- Clarify: Role permissions are for **display/documentation** purposes
- AuthZed is the **source of truth** for authorization
- Role permissions can be used for UI hints, but AuthZed makes final decision
- Document this clearly

**Impact:** Low - Conceptual clarity

---

## Missing Features

### 15. **Bulk Role Assignment** ⚠️ LOW

**Problem:**
- No endpoint for bulk assigning roles to multiple members
- Enterprise scenarios need this

**Recommendation:**
- Add: `POST /organization/bulk-assign-roles`
- Body: `{ memberIds: string[], roleTypes: string[] }`
- Returns: success/failure for each member

**Impact:** Low - Nice to have

---

### 16. **Role Assignment History/Audit** ⚠️ LOW

**Problem:**
- No audit trail for role assignments
- Enterprise needs to track who assigned what role when

**Recommendation:**
- Add `assigned_by` and `assigned_at` to junction tables (optional)
- Or create separate audit log table
- Document as future enhancement

**Impact:** Low - Enterprise compliance

---

## Summary of Critical Fixes Needed

1. ✅ **Role type uniqueness** - RESOLVED: Types are unique per resource (like slugs)
2. **Fix invitation schema** - Use role types, not IDs (Issue #2)
3. **Add unique constraints** - Prevent duplicate roles (Issue #3) - Already correct, just needs enforcement
4. **Add role validation** - Validate types exist before assignment (Issue #4)
5. **Standardize API naming** - Consistent patterns (Issue #6)
6. **Specify API responses** - Clear response structures (Issue #7)
7. **Add role lookup endpoint** - For getting full role details (Issue #8)
8. **Clarify team role scope** - Document clearly (Issue #9)
9. **Define role deletion strategy** - How to handle deletions (Issue #11)

## Recommended Next Steps

1. ✅ Issue #1 resolved - role types are unique identifiers (slugs)
2. Fix schema inconsistencies (Issue #2 - invitation schema)
3. Ensure unique constraints are enforced (Issue #3)
4. Add validation logic (Issue #4 - validate role types exist)
5. Standardize API design (Issues #6, #7, #8)
6. Document edge cases and enterprise scenarios
7. Clarify that multiple roles can share permissions but must have different types

