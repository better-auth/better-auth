# Implementation Plan: Centralized Fetch Instance in Context

## Architecture Overview

### Current State
- `betterFetch` is imported directly from `@better-fetch/fetch` in ~61 files
- No centralized fetch configuration
- No way to pass custom fetch options (proxy, etc.)

### Proposed State
- Create configured `betterFetch` instance in `AuthContext`
- All code uses `ctx.context.fetch` (endpoints) or `getAuthContext().context.fetch` (helpers)
- User can configure fetch via `fetchOptions` in `betterAuth()` config

## Implementation Steps

### Step 1: Add `fetchOptions` to BetterAuthOptions

**File:** `/packages/core/src/types/init-options.ts`

```typescript
export type BetterAuthOptions = {
  // ... existing options ...
  
  /**
   * Fetch options for server-side requests (OAuth, etc.)
   * 
   * Configure custom fetch behavior for outbound requests.
   * Useful for corporate proxy support.
   * 
   * @example
   * ```typescript
   * import { ProxyAgent } from 'undici';
   * 
   * betterAuth({
   *   fetchOptions: {
   *     dispatcher: new ProxyAgent(process.env.PROXY_URL)
   *   }
   * })
   * ```
   */
  fetchOptions?: {
    /**
     * Custom fetch implementation
     */
    customFetchImpl?: typeof fetch;
    /**
     * Additional options merged with each request
     */
    [key: string]: any;
  } | undefined;
};
```

### Step 2: Add `fetch` to AuthContext

**File:** `/packages/core/src/types/context.ts`

```typescript
export type AuthContext = 
  PluginContext &
  InfoContext & {
    // ... existing fields ...
    
    /**
     * Configured fetch instance for all outbound requests.
     * Uses fetchOptions from BetterAuthOptions.
     * 
     * @example
     * ```typescript
     * // In endpoint
     * const { data } = await ctx.context.fetch(url, { method: 'POST' });
     * 
     * // In helper/provider (using async storage)
     * const ctx = await getCurrentAuthContext();
     * const { data } = await ctx.context.fetch(url);
     * ```
     */
    fetch: typeof betterFetch;
  };
```

### Step 3: Create Fetch Instance in createAuthContext

**File:** `/packages/better-auth/src/context/create-context.ts`

Add after line 106 (after logger creation):

```typescript
import { createFetch } from "@better-fetch/fetch";

// ... in createAuthContext function ...

const logger = createLogger(options.logger);

// Create configured fetch instance
const configuredFetch = createFetch({
  customFetchImpl: fetch,
  ...options.fetchOptions,
});
```

Then add to the context object (around line 185):

```typescript
const ctx: AuthContext = {
  // ... existing fields ...
  fetch: configuredFetch,
  // ... rest of fields ...
};
```

### Step 4: Replace All betterFetch Calls

We need to replace betterFetch calls in these categories:

#### Category A: Endpoints (Have `ctx`)
Replace: `betterFetch(...)` → `ctx.context.fetch(...)`

Files:
- `/packages/better-auth/src/plugins/captcha/verify-handlers/*.ts` (4 files)
- `/packages/better-auth/src/plugins/generic-oauth/routes.ts`
- `/packages/better-auth/src/plugins/haveibeenpwned/index.ts`
- `/packages/sso/src/routes/sso.ts`
- Any other endpoint files

#### Category B: OAuth2 Core Functions (No ctx - need to accept it)
These need to accept `fetch` parameter and use it:

Files:
- `/packages/core/src/oauth2/validate-authorization-code.ts`
- `/packages/core/src/oauth2/refresh-access-token.ts`
- `/packages/core/src/oauth2/verify.ts`
- `/packages/core/src/oauth2/client-credentials-token.ts`

Pattern:
```typescript
// Before
export async function validateAuthorizationCode({ code, ... }) {
  const { data } = await betterFetch(url, options);
}

// After
export async function validateAuthorizationCode({ 
  code, 
  ...,
  fetch = betterFetch // Default for backwards compat
}) {
  const { data } = await fetch(url, options);
}
```

#### Category C: Social Providers (No ctx - call OAuth2 core)
These call OAuth2 core functions, so they need to pass fetch through.

All 34 providers in `/packages/core/src/social-providers/*.ts`

Pattern:
```typescript
// Provider definition
export const github = (options: GithubOptions) => {
  return {
    validateAuthorizationCode: async ({ code, ... }, fetch?) => {
      return validateAuthorizationCode({
        code,
        ...,
        fetch, // Pass through
      });
    },
    
    async getUserInfo(token, fetch = betterFetch) {
      const { data } = await fetch(url, options); // Use passed fetch
    }
  };
};
```

#### Category D: Generic OAuth Plugin (Has ctx in routes)
Files:
- `/packages/better-auth/src/plugins/generic-oauth/routes.ts`
- `/packages/better-auth/src/plugins/generic-oauth/index.ts`

Use `ctx.context.fetch`

#### Category E: SSO Plugin (Might have ctx)
Files:
- `/packages/sso/src/oidc/discovery.ts`
- `/packages/sso/src/routes/sso.ts`

Check if they have ctx, if yes use `ctx.context.fetch`, if not pass fetch parameter

#### Category F: Telemetry (Independent)
File: `/packages/telemetry/src/index.ts`

This is separate from auth context, can keep using betterFetch directly OR accept optional fetch parameter

## Files That Can't Access Context

Based on the audit, these files DON'T have direct context access:

1. **OAuth2 Core** (4 files) - Pure functions called by providers
   - Solution: Accept optional `fetch` parameter, default to betterFetch
   
2. **Social Providers** (34 files) - Factory functions that return provider object
   - Solution: Accept `fetch` in methods, pass to OAuth2 core
   
3. **Generic OAuth Providers** (9 files) - Similar to social providers
   - Solution: Same pattern as social providers

4. **SSO Discovery** - Helper functions
   - Solution: Accept optional `fetch` parameter

## How Fetch Propagates

```
User Config
  ↓
fetchOptions in BetterAuthOptions
  ↓
createAuthContext creates fetch instance
  ↓
Stored in ctx.context.fetch
  ↓
  ├─→ Endpoints: use ctx.context.fetch directly
  │
  ├─→ Routes call providers: pass ctx.context.fetch
  │     ↓
  │   Providers accept fetch parameter
  │     ↓
  │   Pass to OAuth2 core functions
  │
  └─→ Helpers: await getCurrentAuthContext() then use ctx.context.fetch
```

## Implementation Order

### Phase 1: Foundation ✅
1. Add `fetchOptions` to BetterAuthOptions type
2. Add `fetch` to AuthContext type
3. Create fetch instance in createAuthContext
4. Test that context is created correctly

### Phase 2: OAuth2 Core
1. Update validateAuthorizationCode to accept fetch
2. Update refreshAccessToken to accept fetch
3. Update verify.ts functions to accept fetch
4. Update clientCredentialsToken to accept fetch
5. Test OAuth2 core with custom fetch

### Phase 3: Social Providers (Batch)
1. Update OAuthProvider interface to accept fetch
2. Update github provider (test pattern)
3. Update remaining 33 providers
4. Test with multiple providers

### Phase 4: Endpoints & Routes
1. Update captcha verify handlers
2. Update generic OAuth routes
3. Update SSO routes
4. Update haveibeenpwned
5. Update telemetry (optional)
6. Test end-to-end OAuth flows

### Phase 5: Generic OAuth Plugin
1. Update generic OAuth provider factories
2. Update routes to pass fetch
3. Test generic OAuth flows

### Phase 6: SSO Plugin
1. Update OIDC discovery
2. Update SAML handlers
3. Test SSO flows

### Phase 7: Testing & Cleanup
1. Integration test with proxy
2. Update any tests that mock betterFetch
3. Documentation
4. Remove unused betterFetch imports

## Testing Strategy

### Unit Tests
```typescript
test('createAuthContext creates configured fetch', async () => {
  const mockDispatcher = new ProxyAgent('http://proxy:8080');
  const options = {
    fetchOptions: { dispatcher: mockDispatcher }
  };
  
  const ctx = await createAuthContext(adapter, options, getDatabaseType);
  
  expect(ctx.fetch).toBeDefined();
  // Verify fetch uses mockDispatcher
});
```

### Integration Tests
```typescript
test('OAuth flow uses configured proxy', async () => {
  const auth = betterAuth({
    fetchOptions: {
      dispatcher: new ProxyAgent(PROXY_URL)
    }
  });
  
  // Trigger OAuth flow
  // Verify requests went through proxy
});
```

## Backwards Compatibility

- `fetchOptions` is optional - existing code works unchanged
- OAuth2 core functions default `fetch` parameter to `betterFetch`
- Provider methods default `fetch` parameter to `betterFetch`
- Zero breaking changes

## Questions to Resolve

1. ✅ Should telemetry use the configured fetch? 
   - Probably not - it's reporting to Better Auth servers, not OAuth providers
   - Can keep using betterFetch directly

2. ✅ How to handle provider factory functions that don't have ctx?
   - Accept fetch in the methods (validateAuthorizationCode, getUserInfo)
   - Routes pass ctx.context.fetch when calling these methods

3. ✅ Should we update OAuthProvider interface?
   - Yes, methods should accept optional fetch parameter

## File Count Estimate

- Type definitions: 2 files
- Context creation: 1 file
- OAuth2 core: 4 files
- Social providers: 34 files
- Generic OAuth providers: 9 files
- Endpoints/routes: ~10 files
- SSO: ~3 files
- Tests: ~10 files

**Total: ~73 files**

## Next Steps

1. ✅ Get feedback on approach
2. Start Phase 1 (types and context)
3. Implement Phase 2 (OAuth2 core) and test
4. Implement Phases 3-6 in parallel/batches
5. Phase 7: Testing and docs
