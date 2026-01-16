# Documentation Restructure Proposal

This document analyzes the current documentation layout and proposes a more straightforward structure using Fumadocs conventions.

## Current State Analysis

### Current Navigation Structure (from `sidebar-content.tsx`)

The sidebar currently has **9 top-level categories**:

| Category | Contents | Issues |
|----------|----------|--------|
| **Get Started** | Introduction, Comparison, Installation, Basic Usage | ✅ Good |
| **Concepts** | API, CLI, Client, Cookies, Database, Email, Hooks, Plugins, OAuth, Rate Limit, Sessions, TypeScript, Users & Accounts | ⚠️ Catch-all, 13 items |
| **Authentication** | Email & Password + 35 Social Providers | ⚠️ Mixed core + providers |
| **Databases** | MySQL, SQLite, PostgreSQL, MS SQL, MongoDB + Drizzle, Prisma + Community | ⚠️ Mixes databases with ORMs |
| **Integrations** | Full Stack + Backend + Mobile frameworks | ✅ Good grouping |
| **Plugins** | 36 plugins in 6 groups (Auth, Authorization, Enterprise, Utility, Payments, Others) | ⚠️ Large flat list |
| **Guides** | Tutorials + Migration guides | ✅ Good |
| **Reference** | Options, Contributing, Resources, Security, Telemetry, FAQ | ⚠️ Mixed reference + meta |
| **Examples** | Astro, Remix, Next.js, Nuxt, SvelteKit | ❓ Overlaps with Integrations |

### Current File Structure
```
content/docs/
├── adapters/           # 9 files (databases + ORMs mixed)
├── authentication/     # 35 files (social providers)
├── concepts/           # 13 files (mixed topics)
├── errors/             # 14 files
├── examples/           # 5 files
├── guides/             # 10 files
├── integrations/       # 17 files
├── plugins/            # 36 flat files ← needs structure
├── reference/          # 6 files
├── basic-usage.mdx
├── comparison.mdx
├── installation.mdx
├── introduction.mdx
└── meta.json
```

---

## Problem: Plugins as a Flat List

The **Plugins** section currently lists 36 plugins as flat files, grouped only by visual separators in the sidebar:

```
Plugins/
├── Authentication (group label)
│   ├── 2fa.mdx
│   ├── username.mdx
│   ├── anonymous.mdx
│   └── ... (10 plugins)
├── Authorization (group label)
│   ├── admin.mdx
│   ├── api-key.mdx
│   ├── organization.mdx
│   └── mcp.mdx
├── Enterprise (group label)
│   ├── oidc-provider.mdx
│   ├── oauth-provider.mdx
│   ├── sso.mdx
│   └── scim.mdx
├── Utility (group label)
│   └── ... (10 plugins)
├── Payments (group label)
│   └── ... (6 plugins)
└── Others (group label)
    └── ... (2 plugins)
```

**Issues:**
1. No folder structure - just visual groups in sidebar code
2. Can't use Fumadocs accordion/collapsible features
3. All 36 plugins at same level

---

## Proposed Structure

### Option A: Category Folders with meta.json (Recommended)

Convert plugin groups into actual folders:

```
content/docs/plugins/
├── authentication/
│   ├── meta.json           # { "title": "Authentication", "pages": [...] }
│   ├── 2fa.mdx
│   ├── username.mdx
│   ├── anonymous.mdx
│   ├── phone-number.mdx
│   ├── magic-link.mdx
│   ├── email-otp.mdx
│   ├── passkey.mdx
│   ├── generic-oauth.mdx
│   ├── one-tap.mdx
│   └── siwe.mdx
├── authorization/
│   ├── meta.json
│   ├── admin.mdx
│   ├── api-key.mdx
│   ├── organization.mdx
│   └── mcp.mdx
├── enterprise/
│   ├── meta.json
│   ├── oidc-provider.mdx
│   ├── oauth-provider.mdx
│   ├── sso.mdx
│   └── scim.mdx
├── utility/
│   ├── meta.json
│   ├── bearer.mdx
│   ├── device-authorization.mdx
│   ├── captcha.mdx
│   ├── have-i-been-pwned.mdx
│   ├── last-login-method.mdx
│   ├── multi-session.mdx
│   ├── oauth-proxy.mdx
│   ├── one-time-token.mdx
│   ├── open-api.mdx
│   └── jwt.mdx
├── payments/
│   ├── meta.json
│   ├── stripe.mdx
│   ├── polar.mdx
│   ├── autumn.mdx
│   ├── dodopayments.mdx
│   ├── creem.mdx
│   └── commet.mdx
├── community-plugins.mdx
└── meta.json               # Top-level plugins meta
```

**Sidebar Result:**
```
▼ Plugins
  ▼ Authentication
    • Two Factor
    • Username
    • Anonymous
    • ...
  ▼ Authorization
    • Admin
    • API Key
    • Organization
    • MCP
  ▼ Enterprise
    • OIDC Provider
    • OAuth Provider
    • SSO
    • SCIM
  ▼ Utility
    • Bearer
    • Captcha
    • ...
  ▼ Payments
    • Stripe
    • Polar
    • ...
  • Community Plugins
```

### Example meta.json for Plugin Category

**`plugins/authentication/meta.json`:**
```json
{
  "title": "Authentication",
  "description": "Plugins that add authentication methods",
  "pages": [
    "2fa",
    "username",
    "anonymous",
    "phone-number",
    "magic-link",
    "email-otp",
    "passkey",
    "generic-oauth",
    "one-tap",
    "siwe"
  ]
}
```

**`plugins/meta.json`:**
```json
{
  "title": "Plugins",
  "pages": [
    "authentication",
    "authorization",
    "enterprise",
    "utility",
    "payments",
    "community-plugins"
  ]
}
```

---

### Option B: Also Restructure Other Sections

Apply the same pattern to other sections that have logical subgroups:

#### Databases → Adapters (Cleaner naming)
```
content/docs/adapters/
├── databases/
│   ├── meta.json
│   ├── mysql.mdx
│   ├── sqlite.mdx
│   ├── postgresql.mdx
│   ├── mssql.mdx
│   └── mongo.mdx
├── orms/
│   ├── meta.json
│   ├── drizzle.mdx
│   └── prisma.mdx
├── other-relational-databases.mdx
└── community-adapters.mdx
```

#### Integrations (Already well-grouped, just formalize)
```
content/docs/integrations/
├── fullstack/
│   ├── meta.json
│   ├── next.mdx
│   ├── remix.mdx
│   ├── astro.mdx
│   ├── nuxt.mdx
│   ├── svelte-kit.mdx
│   ├── solid-start.mdx
│   └── tanstack.mdx
├── backend/
│   ├── meta.json
│   ├── hono.mdx
│   ├── fastify.mdx
│   ├── express.mdx
│   ├── elysia.mdx
│   ├── nitro.mdx
│   ├── nestjs.mdx
│   └── convex.mdx
├── mobile/
│   ├── meta.json
│   ├── expo.mdx
│   └── lynx.mdx
└── waku.mdx
```

---

## Fumadocs Folder Convention

### How Fumadocs Handles Folders

1. **Folder = Collapsible Section**: A folder with `meta.json` creates a collapsible group
2. **`index.mdx` = Section Landing**: Optional, clicking the folder navigates here
3. **`meta.json` = Ordering**: Controls page order and titles
4. **Automatic Discovery**: Fumadocs finds all `.mdx` files in the folder

### Required Changes

Currently, your sidebar is **manually built** in `sidebar-content.tsx`:

```tsx
// Current approach - everything hardcoded
export const contents: Content[] = [
  {
    title: "Plugins",
    list: [
      { title: "Authentication", group: true },  // Visual only
      { title: "Two Factor", href: "/docs/plugins/2fa" },
      ...
    ]
  }
]
```

**To use Fumadocs folder conventions**, you have two options:

#### Option 1: Keep Manual Sidebar + Add Folder Structure
Keep `sidebar-content.tsx` but update URLs to match new folder structure:
```tsx
{
  title: "Two Factor",
  href: "/docs/plugins/authentication/2fa",  // New path
}
```

#### Option 2: Use Fumadocs Auto-Discovery
Replace manual sidebar with Fumadocs source loader:
```tsx
// source.ts - let Fumadocs build the tree from folders
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});

// Remove manual pageTree override
// source.pageTree = getPageTree();  ← Remove this
```

---

## Recommended Migration Path

### Phase 1: Restructure Plugins Folder (Minimal Risk)

1. Create subfolders: `plugins/authentication/`, `plugins/authorization/`, etc.
2. Move MDX files into appropriate subfolders
3. Add `meta.json` to each subfolder
4. Update `sidebar-content.tsx` with new paths
5. Set up redirects from old URLs

### Phase 2: Evaluate Sidebar Approach

After Phase 1, decide:
- Continue manual sidebar (full control, more maintenance)
- Switch to Fumadocs auto-discovery (less control, automatic updates)

### Phase 3: Apply to Other Sections (Optional)

- Adapters: Split databases/orms
- Integrations: Formalize fullstack/backend/mobile folders

---

## URL Structure Comparison

### Current URLs
```
/docs/plugins/2fa
/docs/plugins/organization
/docs/plugins/stripe
/docs/adapters/drizzle
/docs/integrations/next
```

### Proposed URLs
```
/docs/plugins/authentication/2fa
/docs/plugins/authorization/organization
/docs/plugins/payments/stripe
/docs/adapters/orms/drizzle
/docs/integrations/fullstack/next
```

### Handling Redirects

Add redirects in `next.config.js`:
```js
async redirects() {
  return [
    {
      source: '/docs/plugins/2fa',
      destination: '/docs/plugins/authentication/2fa',
      permanent: true,
    },
    // ... more redirects
  ]
}
```

---

## Summary

| Aspect | Current | Proposed |
|--------|---------|----------|
| Plugin structure | 36 flat files + visual groups | 6 folders with meta.json |
| Sidebar | Fully manual in TSX | Manual or Fumadocs auto |
| Nesting | None | One level (category → plugin) |
| Accordion navigation | Not possible | Yes, via folders |
| URL depth | `/docs/plugins/name` | `/docs/plugins/category/name` |

### Key Benefits
1. **Accordion sidebar** - Collapsible plugin categories
2. **Consistent structure** - All sections follow same pattern
3. **Easier discovery** - Users can browse by category
4. **Fumadocs native** - Uses built-in folder conventions
5. **One level only** - Category → Page (not deeper)

### Questions to Decide

1. **Which sections to restructure?** Just plugins, or also adapters/integrations?
2. **Manual vs auto sidebar?** Keep control or let Fumadocs handle it?
3. **Redirect strategy?** 301 redirects vs preserve old URLs?
4. **Index pages?** Add landing pages for each category folder?
