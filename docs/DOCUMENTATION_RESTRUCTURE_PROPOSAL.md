# Documentation Restructure Proposal

This document outlines a recommended approach for restructuring the Better Auth documentation to address:
1. **Token efficiency** - Reducing page sizes for AI consumption
2. **Consistent structure** - Uniform organization across all sections
3. **Accordion navigation** - Folder-based structure for plugins and similar items
4. **Limited nesting** - Maximum one level deep (Category → sub-page)

## Current State Analysis

### Content Location
- Documentation: `/docs/content/docs/`
- Sidebar: Manually constructed in `sidebar-content.tsx`

### Largest Files (Lines of Code)

#### Plugins (need splitting)
| File | Lines | Sections |
|------|-------|----------|
| `organization.mdx` | 2,539 | Organization, Invitations, Members, Access Control, Dynamic AC, Teams, Schema, Options |
| `oauth-provider.mdx` | 1,879 | Multiple complex sections |
| `sso.mdx` | 1,515 | OIDC, SAML, Provisioning, Security, Domain verification |
| `api-key.mdx` | 1,270 | Multiple sections |
| `stripe.mdx` | 1,052 | Multiple sections |
| `creem.mdx` | 853 | Multiple sections |
| `admin.mdx` | 832 | Multiple sections |

#### Concepts (consider splitting)
| File | Lines |
|------|-------|
| `database.mdx` | 957 |
| `plugins.mdx` | 579 |
| `users-accounts.mdx` | 509 |
| `session-management.mdx` | 508 |
| `oauth.mdx` | 506 |

#### Integrations (borderline)
| File | Lines |
|------|-------|
| `expo.mdx` | 542 |
| `waku.mdx` | 451 |
| `convex.mdx` | 395 |
| `next.mdx` | 392 |

### Current Structure
```
content/docs/
├── adapters/           # 9 flat files
├── authentication/     # 35 flat files (social providers)
├── concepts/           # 13 flat files
├── errors/             # 14 flat files
├── examples/           # 5 flat files
├── guides/             # 10 flat files
├── integrations/       # 17 flat files
├── plugins/            # 36 flat files (LARGE)
├── reference/          # 6 flat files
├── basic-usage.mdx
├── comparison.mdx
├── installation.mdx
├── introduction.mdx
└── meta.json
```

---

## Recommended Approach

### Strategy Overview

Use **Fumadocs folder-based navigation** to create one level of nesting:

```
content/docs/
├── plugins/
│   ├── organization/
│   │   ├── index.mdx           # Overview + Installation
│   │   ├── usage.mdx           # Basic usage
│   │   ├── invitations.mdx     # Invitations system
│   │   ├── members.mdx         # Member management
│   │   ├── access-control.mdx  # Roles & permissions
│   │   ├── teams.mdx           # Teams feature
│   │   └── meta.json           # Sidebar order
│   ├── sso/
│   │   ├── index.mdx
│   │   ├── oidc.mdx
│   │   ├── saml.mdx
│   │   ├── provisioning.mdx
│   │   └── meta.json
│   ├── api-key.mdx             # Smaller plugins stay as single files
│   ├── username.mdx
│   └── ...
```

### Target Page Size Guidelines

| Size | Lines | Tokens (est.) | Recommendation |
|------|-------|---------------|----------------|
| Small | < 200 | < 3K | Keep as single file |
| Medium | 200-500 | 3-8K | Consider splitting if natural sections exist |
| Large | 500-800 | 8-12K | Split into 2-3 pages |
| Very Large | 800+ | 12K+ | Split into 4+ pages |

**Target: ~300-400 lines per page** (approx. 5-6K tokens)

---

## Detailed Restructure Plan

### 1. Plugins (Priority: High)

#### Organization Plugin → Folder Structure
```
plugins/organization/
├── index.mdx           # Overview, Installation (lines 1-65)
├── usage.mdx           # Basic organization CRUD (lines 67-835)
├── invitations.mdx     # Invitation system (lines 836-1040)
├── members.mdx         # Member management (lines 1041-1210)
├── access-control.mdx  # Roles, permissions, custom (lines 1211-1453)
├── dynamic-access.mdx  # Dynamic AC (lines 1453-1712)
├── teams.mdx           # Teams feature (lines 1776-2124)
├── schema.mdx          # Database schema (lines 2124-2520)
└── meta.json
```

**meta.json:**
```json
{
  "title": "Organization",
  "pages": [
    "index",
    "usage",
    "invitations",
    "members",
    "access-control",
    "dynamic-access",
    "teams",
    "schema"
  ]
}
```

#### SSO Plugin → Folder Structure
```
plugins/sso/
├── index.mdx           # Overview, Installation
├── oidc.mdx            # OIDC providers
├── saml.mdx            # SAML providers
├── provisioning.mdx    # User/Org provisioning
├── security.mdx        # SAML security
├── domain.mdx          # Domain verification
├── schema.mdx          # Database schema
└── meta.json
```

#### OAuth Provider Plugin → Folder Structure
```
plugins/oauth-provider/
├── index.mdx           # Overview, Installation
├── configuration.mdx   # Server configuration
├── clients.mdx         # Client management
├── tokens.mdx          # Token handling
├── scopes.mdx          # Scope management
├── schema.mdx          # Database schema
└── meta.json
```

#### API Key Plugin → Folder Structure
```
plugins/api-key/
├── index.mdx           # Overview, Installation
├── usage.mdx           # Creating, validating keys
├── scopes.mdx          # Scopes and permissions
├── configuration.mdx   # Options and customization
└── meta.json
```

#### Other Large Plugins (Split Similarly)
- `stripe.mdx` → `plugins/stripe/` (webhooks, subscriptions, etc.)
- `admin.mdx` → `plugins/admin/` (users, sessions, banning)
- `oidc-provider.mdx` → `plugins/oidc-provider/`

#### Small Plugins (Keep as Single Files)
- `username.mdx` (357 lines) - Keep
- `magic-link.mdx` - Keep
- `anonymous.mdx` - Keep
- `email-otp.mdx` - Keep
- `passkey.mdx` (403 lines) - Keep
- etc.

### 2. Concepts (Priority: Medium)

#### Database Concept → Folder Structure
```
concepts/database/
├── index.mdx           # Overview, adapters intro
├── cli.mdx             # CLI migrations
├── programmatic.mdx    # Programmatic migrations
├── core-schema.mdx     # Core tables
├── custom-fields.mdx   # Field customization
└── meta.json
```

#### Session Management → Folder Structure
```
concepts/sessions/
├── index.mdx           # Overview
├── configuration.mdx   # Cookie config, expiration
├── stateless.mdx       # JWT-based sessions
├── multi-session.mdx   # Multiple sessions
└── meta.json
```

#### Keep as Single Files
- `api.mdx` (117 lines)
- `cli.mdx` (108 lines)
- `cookies.mdx` (95 lines)
- `email.mdx` (204 lines)
- `hooks.mdx` (246 lines)
- `typescript.mdx` (146 lines)

### 3. Integrations (Priority: Low)

Most integrations are appropriately sized. Only consider splitting if content grows:

- `expo.mdx` (542 lines) - Could split into setup/usage/components
- `waku.mdx` (451 lines) - Borderline, monitor

### 4. Sidebar Updates

The sidebar is manually maintained in `sidebar-content.tsx`. After restructuring, update to use folder-based navigation:

```tsx
// Current: Flat list
{
  title: "Organization",
  href: "/docs/plugins/organization",
  icon: Users2,
}

// After: Folder with children (Fumadocs handles this automatically)
// The folder structure will create accordion navigation
```

---

## Implementation Steps

### Phase 1: Large Plugin Restructure
1. Create folder structure for `organization` plugin
2. Split content by logical sections
3. Add `meta.json` for ordering
4. Update cross-references (internal links)
5. Test sidebar navigation
6. Repeat for: `sso`, `oauth-provider`, `api-key`, `stripe`

### Phase 2: Concept Restructure
1. Split `database.mdx` into folder
2. Split `session-management.mdx` if needed
3. Update internal references

### Phase 3: Sidebar Cleanup
1. Simplify `sidebar-content.tsx` to leverage Fumadocs auto-discovery
2. Or maintain manual control with folder awareness

### Phase 4: Validation
1. Check all internal links work
2. Verify search indexing
3. Test AI consumption (token counts)

---

## Fumadocs Configuration

### Using meta.json for Page Ordering

Each folder can have a `meta.json` to control sidebar order:

```json
{
  "title": "Organization",
  "description": "Manage organizations, teams, and access control",
  "pages": [
    "index",
    "---Getting Started---",
    "usage",
    "---Features---",
    "invitations",
    "members",
    "access-control",
    "teams",
    "---Reference---",
    "schema"
  ]
}
```

### Index Page Convention

- `index.mdx` in a folder becomes the parent page
- Clicking the folder name navigates to `index.mdx`
- Sub-pages appear in the sidebar accordion

---

## Example: Organization Plugin Split

### Before (Single 2,539-line file)

```mdx
---
title: Organization
description: The organization plugin...
---

## Installation
...

## Usage
...

## Invitations
...

## Members
...
(continues for 2500+ lines)
```

### After (8 focused files)

**`organization/index.mdx`** (~100 lines)
```mdx
---
title: Organization
description: The organization plugin allows you to manage organizations, members, and teams.
---

Organizations simplify user access and permissions management...

## Installation
<Steps>
...
</Steps>

## What's Next

- [Basic Usage](/docs/plugins/organization/usage) - Create and manage organizations
- [Invitations](/docs/plugins/organization/invitations) - Invite members
- [Access Control](/docs/plugins/organization/access-control) - Configure roles and permissions
```

**`organization/usage.mdx`** (~400 lines)
```mdx
---
title: Organization Usage
description: Creating and managing organizations
---

## Create an Organization
...

## List Organizations
...

## Update Organization
...

## Delete Organization
...
```

**`organization/invitations.mdx`** (~200 lines)
```mdx
---
title: Invitations
description: Managing organization invitations
---

## Setup Invitation Email
...

## Send Invitation
...

## Accept Invitation
...
```

---

## Benefits of This Approach

1. **Token Efficiency**: Each page ~300-400 lines (~5-6K tokens) vs 2,500+ lines
2. **Better Navigation**: Accordion sidebar shows logical structure
3. **Focused Reading**: Users find exactly what they need
4. **Easier Maintenance**: Smaller files are easier to update
5. **Consistent Structure**: All large plugins follow same pattern
6. **SEO Improvement**: More specific URLs for each topic
7. **AI-Friendly**: Smaller context windows, better responses

---

## Files to Keep Unchanged

These files are appropriately sized and don't need restructuring:

- All files under `authentication/` (social providers)
- All files under `errors/`
- All files under `examples/`
- All files under `reference/`
- Most files under `guides/`
- Small plugins (< 500 lines)
- Small concepts (< 500 lines)

---

## Migration Checklist

- [ ] Create folder structure for `organization` plugin
- [ ] Split `organization.mdx` into sub-pages
- [ ] Add `meta.json` for `organization/`
- [ ] Update internal links referencing organization sections
- [ ] Repeat for `sso` plugin
- [ ] Repeat for `oauth-provider` plugin
- [ ] Repeat for `api-key` plugin
- [ ] Repeat for `stripe` plugin
- [ ] Split `concepts/database.mdx` if approved
- [ ] Update `sidebar-content.tsx` for folder awareness
- [ ] Run link checker
- [ ] Test search functionality
- [ ] Verify mobile navigation

---

## Questions for Team

1. Should we also split medium-sized plugins (500-800 lines)?
2. Should `database.mdx` (concepts) follow the same pattern?
3. Do you want automatic sidebar generation or keep manual control?
4. Should we add "Overview" suffixes to index pages or keep titles simple?
5. How should we handle existing bookmarks/links to anchors in the original files?
