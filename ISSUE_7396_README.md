# Issue #7396: Server-side fetchOptions Support - Research Documentation

**Research completed:** January 15, 2026  
**Branch:** `cursor/issue-7396-research-dab8`  
**Issue:** [#7396 - Allow fetchOptions to be passed in options for betterAuth](https://github.com/better-auth/better-auth/issues/7396)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Document Index](#document-index)
3. [Quick Summary](#quick-summary)
4. [Implementation Roadmap](#implementation-roadmap)
5. [Key Decisions Needed](#key-decisions-needed)
6. [Getting Started](#getting-started)

---

## Overview

This research investigates adding `fetchOptions` support to the server-side `betterAuth()` configuration, enabling corporate proxy support and custom fetch implementations for OAuth requests.

### The Problem

Users behind corporate proxies cannot authenticate via OAuth because:
- ❌ Server-side `betterAuth()` doesn't accept fetch customization options
- ❌ OAuth requests fail to reach providers through corporate proxies
- ❌ No workaround exists (unlike Next-Auth which supported this)

### The Solution

Add optional `fetchOptions` to `BetterAuthOptions` that:
- ✅ Accepts proxy configuration (via undici, node-fetch, etc.)
- ✅ Supports custom fetch implementations
- ✅ Provides lifecycle hooks (onRequest, onResponse, onError)
- ✅ Works with all 34 social providers
- ✅ Maintains 100% backward compatibility

---

## Document Index

This research consists of 4 comprehensive documents:

### 1. [RESEARCH_ISSUE_7396.md](./RESEARCH_ISSUE_7396.md) - Comprehensive Research
**Purpose:** Deep technical analysis and implementation planning

**Contents:**
- Issue background and context
- Technical analysis of codebase
- Where OAuth requests are made
- Proposed solution with detailed design
- Complete implementation checklist
- File-by-file modification plan
- Effort estimates

**Read this if:** You need complete technical understanding before implementing

---

### 2. [ISSUE_7396_SUMMARY.md](./ISSUE_7396_SUMMARY.md) - Executive Summary
**Purpose:** High-level overview for decision makers

**Contents:**
- Quick overview and key findings
- API design proposal
- Implementation strategy (7 phases)
- Files to modify (~45-50 files)
- Testing strategy
- Documentation plan
- Timeline estimates (3-5 days)

**Read this if:** You need to understand scope and make go/no-go decision

---

### 3. [ISSUE_7396_IMPLEMENTATION_EXAMPLE.md](./ISSUE_7396_IMPLEMENTATION_EXAMPLE.md) - Code Examples
**Purpose:** Concrete before/after code examples

**Contents:**
- Type definitions (before/after)
- OAuth2 core functions (before/after)
- Provider interface changes
- Social provider implementation examples
- Flow handler examples
- User-facing API examples
- Testing examples

**Read this if:** You're implementing the feature and need concrete examples

---

### 4. [ISSUE_7396_EDGE_CASES.md](./ISSUE_7396_EDGE_CASES.md) - Edge Cases & Considerations
**Purpose:** Identify and solve potential issues

**Contents:**
- Provider-specific edge cases
- Security considerations (SSRF, credential exposure)
- Performance considerations
- Error handling strategies
- Compatibility issues across runtimes
- Testing challenges
- Documentation pitfalls

**Read this if:** You're implementing/reviewing and want to avoid pitfalls

---

## Quick Summary

### What We're Adding

```typescript
// Type definition
export type BetterAuthOptions = {
  // ... existing options ...
  fetchOptions?: {
    customFetchImpl?: typeof fetch;
    onRequest?: (request: Request) => void | Promise<void>;
    onResponse?: (response: Response) => void | Promise<void>;
    onError?: (error: any) => void | Promise<void>;
    [key: string]: any; // Proxy config, headers, etc.
  } | undefined;
};

// Usage
import { ProxyAgent } from 'undici';

betterAuth({
  database: { /* ... */ },
  socialProviders: {
    github: { /* ... */ }
  },
  fetchOptions: {
    dispatcher: new ProxyAgent(process.env.PROXY_URL)
  }
});
```

### Scope of Changes

| Category | Files | Effort |
|----------|-------|--------|
| Core types & context | 2-3 | 2-4h |
| OAuth2 core functions | 5 | 3-5h |
| Social providers | 34 | 8-12h |
| Flow handlers | 2-5 | 2-4h |
| Plugins | 1-2 | 1-2h |
| Tests | 10-15 | 4-6h |
| Documentation | 3-5 | 2-3h |
| **Total** | **~50** | **23-38h** |

### Implementation Pattern

Every OAuth function needs:
1. Accept optional `fetchOptions` parameter
2. Merge with request options: `{ ...requestOptions, ...fetchOptions }`
3. Pass to downstream OAuth functions

Every OAuth flow handler needs:
1. Access from context: `ctx.options.fetchOptions`
2. Pass to provider methods

---

## Implementation Roadmap

### Phase 1: Foundation (2-4 hours) ⚙️

**Goal:** Add types and context infrastructure

**Tasks:**
- [ ] Add `fetchOptions` to `BetterAuthOptions` type
- [ ] Update `AuthContext` interface
- [ ] Pass `fetchOptions` through context initialization
- [ ] Write unit tests for type definitions

**Files:**
- `/packages/core/src/types/init-options.ts`
- `/packages/core/src/types/context.ts` (or similar)
- `/packages/better-auth/src/context/init.ts`

**Success criteria:** TypeScript compiles, types are exported correctly

---

### Phase 2: OAuth2 Core (3-5 hours) 🔧

**Goal:** Update core OAuth2 functions to accept and use `fetchOptions`

**Tasks:**
- [ ] Update `validateAuthorizationCode()` - validate-authorization-code.ts
- [ ] Update `refreshAccessToken()` - refresh-access-token.ts
- [ ] Update `validateToken()` and `getJwks()` - verify.ts
- [ ] Update `clientCredentialsToken()` - client-credentials-token.ts
- [ ] Update `OAuthProvider` interface - oauth-provider.ts
- [ ] Write unit tests for each function

**Pattern:**
```typescript
export async function validateAuthorizationCode({
  // ... existing params ...
  fetchOptions,
}: {
  // ... existing types ...
  fetchOptions?: Record<string, any> | undefined;
}) {
  const { data, error } = await betterFetch(tokenEndpoint, {
    method: "POST",
    body: body,
    headers: requestHeaders,
    ...fetchOptions, // Merge here
  });
  // ...
}
```

**Success criteria:** All OAuth2 core functions accept and use `fetchOptions`

---

### Phase 3: Provider Interface (1-2 hours) 📝

**Goal:** Update the `OAuthProvider` interface

**Tasks:**
- [ ] Add `fetchOptions` parameter to interface methods
- [ ] Update type exports
- [ ] Verify no breaking changes

**File:**
- `/packages/core/src/oauth2/oauth-provider.ts`

**Success criteria:** Interface updated, TypeScript compiles

---

### Phase 4: Social Providers (8-12 hours) 🔌

**Goal:** Update all 34 social providers to pass `fetchOptions`

**Strategy:** Work in batches of 5-10 providers

**Batch 1: Common providers (2-3 hours)**
- [ ] github.ts
- [ ] google.ts
- [ ] facebook.ts
- [ ] apple.ts
- [ ] microsoft-entra-id.ts
- [ ] discord.ts

**Batch 2: Enterprise providers (2-3 hours)**
- [ ] okta (via generic OAuth)
- [ ] auth0 (via generic OAuth)
- [ ] keycloak (via generic OAuth)
- [ ] cognito.ts
- [ ] salesforce.ts
- [ ] linkedin.ts

**Batch 3: Social media providers (2-3 hours)**
- [ ] twitter.ts
- [ ] reddit.ts
- [ ] tiktok.ts
- [ ] twitch.ts
- [ ] spotify.ts
- [ ] kick.ts

**Batch 4: Specialized providers (2-3 hours)**
- [ ] notion.ts
- [ ] figma.ts
- [ ] linear.ts
- [ ] gitlab.ts
- [ ] atlassian.ts
- [ ] vercel.ts

**Batch 5: Remaining providers (2-3 hours)**
- [ ] All remaining 10 providers

**Pattern for each provider:**
```typescript
validateAuthorizationCode: async ({ 
  code, 
  codeVerifier, 
  redirectURI,
  fetchOptions, // Add parameter
}) => {
  return validateAuthorizationCode({
    code,
    codeVerifier,
    redirectURI,
    options,
    tokenEndpoint,
    fetchOptions, // Pass through
  });
},

async getUserInfo(token, fetchOptions) { // Add parameter
  const { data } = await betterFetch(url, {
    headers: { ... },
    ...fetchOptions, // Merge
  });
  // ...
}
```

**Success criteria:** All providers accept and pass `fetchOptions`

---

### Phase 5: Flow Handlers (2-4 hours) 🔄

**Goal:** Update OAuth flow handlers to pass `fetchOptions` from context

**Tasks:**
- [ ] Identify all OAuth flow initiation points
- [ ] Update each to pass `ctx.options.fetchOptions`
- [ ] Test OAuth flows end-to-end

**Pattern:**
```typescript
const tokens = await provider.validateAuthorizationCode({
  code,
  redirectURI,
  codeVerifier,
  fetchOptions: ctx.options.fetchOptions, // From context
});

const userInfo = await provider.getUserInfo(
  tokens,
  ctx.options.fetchOptions, // From context
);
```

**Success criteria:** OAuth flows pass `fetchOptions` correctly

---

### Phase 6: Plugins (1-2 hours) 🔌

**Goal:** Update plugins that use OAuth

**Tasks:**
- [ ] Update generic OAuth provider plugin
- [ ] Check SSO plugins for OAuth usage
- [ ] Update any other plugins making OAuth requests

**Files:**
- `/packages/better-auth/src/plugins/generic-oauth/`
- Check: `/packages/sso/`
- Check: Other plugins

**Success criteria:** All plugins support `fetchOptions`

---

### Phase 7: Testing & Documentation (6-9 hours) 📚

**Testing (4-6 hours):**
- [ ] Unit tests for OAuth2 core functions with `fetchOptions`
- [ ] Parametrized tests for all 34 providers
- [ ] Integration test with actual proxy (docker-compose)
- [ ] Test with different proxy configurations (undici, node-fetch)
- [ ] Test error scenarios (proxy down, wrong config)
- [ ] Test lifecycle hooks (onRequest, onError, etc.)

**Documentation (2-3 hours):**
- [ ] API reference for `fetchOptions`
- [ ] Corporate proxy setup guide
- [ ] Environment-specific configuration guide
- [ ] Security best practices
- [ ] Performance best practices
- [ ] Troubleshooting guide
- [ ] Migration guide (minimal, as feature is additive)
- [ ] Example repository with working proxy setup

**Success criteria:** 
- ✅ All tests pass
- ✅ Documentation is complete and clear
- ✅ Examples work in multiple environments

---

## Key Decisions Needed

Before starting implementation, maintainers should decide:

### 1. API Design ⚠️

**Question:** Is the proposed `fetchOptions` structure acceptable?

```typescript
fetchOptions?: {
  customFetchImpl?: typeof fetch;
  onRequest?: (request: Request) => void | Promise<void>;
  onResponse?: (response: Response) => void | Promise<void>;
  onError?: (error: any) => void | Promise<void>;
  [key: string]: any;
} | undefined;
```

**Alternatives:**
- More restrictive (only specific options allowed)
- More permissive (any fetch options, no lifecycle hooks)
- Different naming (e.g., `oauth.fetchOptions`)

**Recommendation:** Approve as proposed - mirrors client-side API

---

### 2. Scope 📏

**Question:** Global only, or also per-provider?

**Option A: Global only (proposed)**
```typescript
betterAuth({
  fetchOptions: { /* applies to all providers */ }
})
```

**Option B: Global + per-provider**
```typescript
betterAuth({
  fetchOptions: { /* default */ },
  socialProviders: {
    github: {
      clientId: '...',
      fetchOptions: { /* github-specific */ }
    }
  }
})
```

**Recommendation:** Start with global only (simpler), add per-provider if needed

---

### 3. Error Handling 🚨

**Question:** Should lifecycle hook errors fail the request or be caught?

**Option A: Let errors propagate (proposed)**
- Hook error → OAuth request fails
- Fail fast, developer fixes hook

**Option B: Catch and log**
- Hook error → Log warning, continue request
- More resilient, but hides issues

**Recommendation:** Option A - fail fast

---

### 4. Provider-Specific Headers 📋

**Question:** How to handle conflicts between user headers and provider-required headers?

**Option A: Provider headers take precedence (proposed)**
```typescript
const { data } = await betterFetch(url, {
  ...fetchOptions,
  headers: {
    ...fetchOptions?.headers, // User headers
    'User-Agent': 'better-auth', // Override
    authorization: `Bearer ${token}`, // Override
  },
});
```

**Option B: Deep merge with conflict detection**
- Warn if user tries to override critical headers

**Recommendation:** Option A - simpler, clear precedence

---

### 5. Version 🔢

**Question:** What version bump?

- **Patch (1.x.y):** Bug fix
- **Minor (1.y.0):** New feature, backward compatible ✅
- **Major (2.0.0):** Breaking changes

**Recommendation:** Minor version - new feature, fully backward compatible

---

### 6. Priority 🚀

**Question:** Should this be fast-tracked?

**Context:**
- Corporate users are currently blocked
- No workaround exists
- Next-Auth migration pain point

**Options:**
- Fast-track (prioritize for next release)
- Normal priority (fits in roadmap)
- Backlog (nice-to-have)

**Recommendation:** Fast-track - unblocks corporate users

---

## Getting Started

### For Implementers

1. **Read documents in order:**
   - RESEARCH_ISSUE_7396.md (comprehensive analysis)
   - ISSUE_7396_SUMMARY.md (scope and timeline)
   - ISSUE_7396_IMPLEMENTATION_EXAMPLE.md (code examples)
   - ISSUE_7396_EDGE_CASES.md (pitfalls to avoid)

2. **Get maintainer feedback:**
   - Review key decisions above
   - Get approval on API design
   - Align on priorities

3. **Start with Phase 1:**
   - Create feature branch
   - Add types and context
   - Get early feedback

4. **Iterate through phases:**
   - Complete each phase before next
   - Write tests as you go
   - Commit frequently with descriptive messages

### For Reviewers

1. **Review this README first**
   - Understand scope and approach
   - Check key decisions

2. **Review implementation documents**
   - ISSUE_7396_SUMMARY.md for overview
   - ISSUE_7396_IMPLEMENTATION_EXAMPLE.md for code patterns
   - ISSUE_7396_EDGE_CASES.md for gotchas

3. **Key review points:**
   - Is `fetchOptions` passed to ALL OAuth requests?
   - Are provider-required headers protected?
   - Is the pattern consistent across all providers?
   - Are edge cases handled?
   - Is documentation complete?

---

## Testing the Implementation

### Unit Tests
```bash
# Test OAuth2 core with fetchOptions
pnpm test packages/core/src/oauth2

# Test specific provider
pnpm test packages/core/src/social-providers/github.test.ts
```

### Integration Tests
```bash
# Start test proxy
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
pnpm test:integration --grep "proxy"
```

### Manual Testing
```bash
# Start example app with proxy config
cd demo/nextjs
PROXY_URL=http://localhost:3128 pnpm dev

# Test OAuth flow
# Visit http://localhost:3000/sign-in
# Click "Sign in with GitHub"
# Verify authentication succeeds
```

---

## Success Metrics

Implementation is complete when:

- ✅ All 34 social providers support `fetchOptions`
- ✅ Generic OAuth plugin supports `fetchOptions`
- ✅ All OAuth requests pass through configured proxy
- ✅ All tests pass (unit, integration, e2e)
- ✅ Documentation is complete with examples
- ✅ No breaking changes introduced
- ✅ TypeScript types are correct and exported
- ✅ Performance is not degraded
- ✅ Security considerations are documented

---

## Resources

### Related Issues
- [#7396 - Original feature request](https://github.com/better-auth/better-auth/issues/7396)

### External References
- [Next-Auth Corporate Proxy Tutorial](https://next-auth.js.org/tutorials/corporate-proxy)
- [AuthJS Corporate Proxy Guide](https://authjs.dev/guides/corporate-proxy)

### Libraries
- [undici](https://github.com/nodejs/undici) - Node.js HTTP client with proxy support
- [https-proxy-agent](https://github.com/TooTallNate/proxy-agents) - Proxy agent for node-fetch

### Example Code
- Client-side implementation: `/packages/better-auth/src/client/config.ts`

---

## Questions or Feedback?

For questions or feedback on this research:
1. Comment on [issue #7396](https://github.com/better-auth/better-auth/issues/7396)
2. Tag maintainers: @bekacru @ping__
3. Discuss in Better Auth Discord

---

**Research Status:** ✅ Complete  
**Next Step:** Maintainer review and approval to proceed with implementation  
**Branch:** `cursor/issue-7396-research-dab8`  
**Commits:** 
- `bd843a699` - Initial comprehensive research
- `3a6babaa9` - Executive summary
- `202305256` - Implementation examples
- `24392f9ca` - Edge cases and considerations
- (this document)
