# Research: Issue #7396 - Server-side fetchOptions Support

## Issue Summary

**Title:** [Feature Request] Allow fetchOptions to be passed in options for betterAuth (not client)

**Reporter:** @stayclaxxy

**Request:** Add support for `fetchOptions` on the server-side `betterAuth()` configuration to enable custom fetch implementations for OAuth requests, particularly for corporate proxy support.

## Background

### Current State

1. **Client-side support exists:**
   - `createAuthClient()` accepts `fetchOptions` parameter
   - Located in: `/packages/better-auth/src/client/config.ts`
   - Supports lifecycle hooks: `onSuccess`, `onError`, `onRequest`, `onResponse`
   - Supports custom fetch plugins and base fetch configuration

2. **Server-side lacks this feature:**
   - `betterAuth()` options (`BetterAuthOptions`) does not include `fetchOptions`
   - All OAuth requests use `betterFetch` from `@better-fetch/fetch`
   - No way to customize fetch behavior for OAuth provider requests

### Use Case

Users behind corporate proxies need to configure custom fetch implementations similar to Next-Auth's corporate proxy workaround:
- https://next-auth.js.org/tutorials/corporate-proxy
- https://authjs.dev/guides/corporate-proxy

In Next-Auth, this was achieved by customizing the OpenID client to use a custom HTTP agent.

## Technical Analysis

### Where OAuth Requests Are Made

1. **Core OAuth2 Operations** (`packages/core/src/oauth2/`):
   
   - **Token Exchange:** `validate-authorization-code.ts`
     ```typescript
     const { data, error } = await betterFetch<object>(tokenEndpoint, {
       method: "POST",
       body: body,
       headers: requestHeaders,
     });
     ```
   
   - **Token Refresh:** `refresh-access-token.ts`
     ```typescript
     const { data, error } = await betterFetch<{...}>(tokenEndpoint, {
       method: "POST",
       body,
       headers,
     });
     ```
   
   - **JWKS Fetching:** `validate-authorization-code.ts`
     ```typescript
     const { data, error } = await betterFetch<{...}>(jwksEndpoint, {
       method: "GET",
       headers: { accept: "application/json" },
     });
     ```

2. **Social Provider User Info Fetching** (`packages/core/src/social-providers/`):
   
   - **GitHub:** `github.ts`
     ```typescript
     const { data: profile, error } = await betterFetch<GithubProfile>(
       "https://api.github.com/user",
       { headers: { authorization: `Bearer ${token.accessToken}` } }
     );
     ```
   
   - **Similar patterns in:** `zoom.ts`, `line.ts`, `microsoft-entra-id.ts`, `notion.ts`, and all other social providers

3. **Generic OAuth Provider Plugin** (`packages/better-auth/src/plugins/generic-oauth/`):
   - Also uses the same OAuth2 core functions

### Current Architecture

```
betterAuth(options: BetterAuthOptions)
  ↓
socialProviders → OAuth providers (github, google, etc.)
  ↓
OAuth2 core functions (validateAuthorizationCode, refreshAccessToken)
  ↓
betterFetch() - NO custom options passed
```

## Proposed Solution

### 1. Add fetchOptions to BetterAuthOptions

**Location:** `/packages/core/src/types/init-options.ts`

Add a new field to `BetterAuthOptions`:

```typescript
export type BetterAuthOptions = {
  // ... existing fields ...
  
  /**
   * Fetch options for server-side OAuth requests
   * 
   * This allows customization of fetch behavior for all outbound
   * OAuth provider requests (token exchange, refresh, user info, etc.)
   * 
   * Useful for:
   * - Corporate proxy configuration
   * - Custom fetch implementations
   * - Request/response interceptors
   * 
   * @example
   * ```ts
   * import { ProxyAgent } from 'undici';
   * 
   * betterAuth({
   *   fetchOptions: {
   *     dispatcher: new ProxyAgent('http://proxy.company.com:8080')
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
     * Request interceptor
     */
    onRequest?: (request: Request) => void | Promise<void>;
    /**
     * Response interceptor
     */
    onResponse?: (response: Response) => void | Promise<void>;
    /**
     * Error handler
     */
    onError?: (error: any) => void | Promise<void>;
    /**
     * Success handler
     */
    onSuccess?: (response: Response) => void | Promise<void>;
    /**
     * Additional fetch options (headers, agent, etc.)
     * These will be merged with request-specific options
     */
    [key: string]: any;
  } | undefined;
  
  // ... rest of fields ...
};
```

### 2. Pass fetchOptions Through Context

**Location:** `/packages/better-auth/src/context/init.ts` or similar

The `AuthContext` needs to store and expose these options:

```typescript
export interface AuthContext {
  // ... existing fields ...
  fetchOptions?: BetterAuthOptions['fetchOptions'];
  // ... rest of fields ...
}
```

### 3. Update OAuth2 Core Functions

**Locations:** 
- `/packages/core/src/oauth2/validate-authorization-code.ts`
- `/packages/core/src/oauth2/refresh-access-token.ts`
- `/packages/core/src/oauth2/verify.ts`

Add optional `fetchOptions` parameter to these functions:

```typescript
export async function validateAuthorizationCode({
  code,
  codeVerifier,
  redirectURI,
  options,
  tokenEndpoint,
  authentication,
  deviceId,
  headers,
  additionalParams = {},
  resource,
  fetchOptions, // NEW
}: {
  // ... existing params ...
  fetchOptions?: Record<string, any> | undefined; // NEW
}) {
  const { body, headers: requestHeaders } = createAuthorizationCodeRequest({
    // ... params ...
  });

  const { data, error } = await betterFetch<object>(tokenEndpoint, {
    method: "POST",
    body: body,
    headers: requestHeaders,
    ...fetchOptions, // Merge custom fetch options
  });

  // ... rest ...
}
```

Similar changes for:
- `refreshAccessToken()`
- `validateToken()`
- `getJwks()`

### 4. Update OAuth Provider Interface

**Location:** `/packages/core/src/oauth2/oauth-provider.ts`

The `OAuthProvider` interface methods need to accept and pass through `fetchOptions`:

```typescript
export interface OAuthProvider<T, O> {
  // ... existing fields ...
  
  validateAuthorizationCode: (data: {
    code: string;
    redirectURI: string;
    codeVerifier?: string | undefined;
    deviceId?: string | undefined;
    fetchOptions?: Record<string, any> | undefined; // NEW
  }) => Promise<OAuth2Tokens>;
  
  getUserInfo: (
    token: OAuth2Tokens & { user?: any },
    fetchOptions?: Record<string, any> | undefined, // NEW
  ) => Promise<{ user: OAuth2UserInfo; data: T } | null>;
  
  refreshAccessToken?: (
    refreshToken: string,
    fetchOptions?: Record<string, any> | undefined, // NEW
  ) => Promise<OAuth2Tokens> | undefined;
}
```

### 5. Update All Social Providers

**Location:** `/packages/core/src/social-providers/*.ts`

Each social provider needs to:
1. Accept `fetchOptions` in their methods
2. Pass it to OAuth2 core functions
3. Pass it to their own `betterFetch` calls

**Example for GitHub provider:**

```typescript
export const github = (options: GithubOptions) => {
  return {
    id: "github",
    name: "GitHub",
    // ... createAuthorizationURL ...
    
    validateAuthorizationCode: async ({ 
      code, 
      codeVerifier, 
      redirectURI,
      fetchOptions, // NEW
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
    
    async getUserInfo(token, fetchOptions) { // NEW parameter
      if (options.getUserInfo) {
        return options.getUserInfo(token);
      }
      
      const { data: profile, error } = await betterFetch<GithubProfile>(
        "https://api.github.com/user",
        {
          headers: {
            "User-Agent": "better-auth",
            authorization: `Bearer ${token.accessToken}`,
          },
          ...fetchOptions, // Merge custom options
        },
      );
      
      // ... rest ...
    },
    
    // ... rest ...
  };
};
```

This pattern needs to be replicated across **all 34 social providers**.

### 6. Update OAuth Flow Handlers

**Location:** Wherever OAuth flows are initiated (need to identify these files)

The handlers that call provider methods need to:
1. Access `fetchOptions` from context
2. Pass it to provider methods

```typescript
// Example pseudo-code
const provider = getProvider(providerId);
const tokens = await provider.validateAuthorizationCode({
  code,
  redirectURI,
  codeVerifier,
  fetchOptions: ctx.options.fetchOptions, // Pass from context
});

const userInfo = await provider.getUserInfo(
  tokens,
  ctx.options.fetchOptions, // Pass from context
);
```

### 7. Update Generic OAuth Plugin

**Location:** `/packages/better-auth/src/plugins/generic-oauth/`

The generic OAuth provider plugin also needs to support passing through `fetchOptions`.

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Add `fetchOptions` to `BetterAuthOptions` type
- [ ] Update `AuthContext` to include `fetchOptions`
- [ ] Update context initialization to pass `fetchOptions`

### Phase 2: OAuth2 Core
- [ ] Update `validateAuthorizationCode()` to accept and use `fetchOptions`
- [ ] Update `refreshAccessToken()` to accept and use `fetchOptions`
- [ ] Update `validateToken()` to accept and use `fetchOptions`
- [ ] Update `getJwks()` to accept and use `fetchOptions`
- [ ] Update `clientCredentialsToken()` to accept and use `fetchOptions`

### Phase 3: OAuth Provider Interface
- [ ] Update `OAuthProvider` interface with `fetchOptions` parameters
- [ ] Update `ProviderOptions` if needed

### Phase 4: Social Providers (34 providers)
- [ ] apple.ts
- [ ] atlassian.ts
- [ ] cognito.ts
- [ ] discord.ts
- [ ] dropbox.ts
- [ ] facebook.ts
- [ ] figma.ts
- [ ] github.ts
- [ ] gitlab.ts
- [ ] google.ts
- [ ] huggingface.ts
- [ ] kakao.ts
- [ ] kick.ts
- [ ] line.ts
- [ ] linear.ts
- [ ] linkedin.ts
- [ ] microsoft-entra-id.ts
- [ ] naver.ts
- [ ] notion.ts
- [ ] paybin.ts
- [ ] paypal.ts
- [ ] polar.ts
- [ ] reddit.ts
- [ ] roblox.ts
- [ ] salesforce.ts
- [ ] slack.ts
- [ ] spotify.ts
- [ ] tiktok.ts
- [ ] twitch.ts
- [ ] twitter.ts
- [ ] vercel.ts
- [ ] vk.ts
- [ ] zoom.ts
- [ ] (any new providers)

### Phase 5: OAuth Flow Handlers
- [ ] Identify all locations where OAuth flows are initiated
- [ ] Update each to pass `fetchOptions` from context to provider methods

### Phase 6: Plugins
- [ ] Update generic OAuth provider plugin
- [ ] Check if any other plugins make OAuth requests

### Phase 7: Testing & Documentation
- [ ] Add unit tests for fetch option passing
- [ ] Add integration tests with proxy configuration
- [ ] Document the feature in docs
- [ ] Add examples for common use cases (corporate proxy, custom fetch)
- [ ] Update TypeScript types exports

## Considerations

### Backward Compatibility
- The changes should be fully backward compatible
- `fetchOptions` is optional, defaulting to undefined
- Existing code will continue to work without changes

### Security
- Users should be warned about security implications of custom fetch implementations
- Documentation should emphasize proper proxy configuration

### Performance
- Minimal performance impact as we're just passing options through
- No additional overhead when `fetchOptions` is not provided

### Edge Cases
- What if a provider has its own `getUserInfo` implementation?
  - These custom implementations should also respect `fetchOptions`
  - May need to pass it through the options object
  
- What about OIDC providers?
  - Need to check if OIDC plugin makes additional requests
  - Should follow the same pattern

### Alternative Approaches

1. **Global fetch override:**
   - Pros: Simpler implementation, one place to configure
   - Cons: Less flexible, affects all fetch calls not just OAuth

2. **Per-provider configuration:**
   - Pros: More granular control
   - Cons: More complex API, harder to maintain

3. **Fetch middleware/interceptor pattern:**
   - Pros: Very flexible, composable
   - Cons: More complex implementation, steeper learning curve

**Recommendation:** Stick with the proposed solution (fetchOptions in main config) as it:
- Mirrors the existing client-side API
- Is familiar to developers
- Provides sufficient flexibility for most use cases
- Is relatively straightforward to implement

## Related Code Locations

### Key Files to Modify:
1. `/packages/core/src/types/init-options.ts` - Add `fetchOptions` type
2. `/packages/core/src/types/context.ts` - Update `AuthContext`
3. `/packages/core/src/oauth2/*.ts` - Update OAuth2 core functions (5 files)
4. `/packages/core/src/oauth2/oauth-provider.ts` - Update interface
5. `/packages/core/src/social-providers/*.ts` - Update all providers (34 files)
6. OAuth flow handlers (need to identify)
7. `/packages/better-auth/src/plugins/generic-oauth/` - Update plugin

### Files to Review:
1. `/packages/better-auth/src/client/config.ts` - Reference for client-side implementation
2. `/packages/better-auth/src/auth/auth.ts` - Entry point
3. `/packages/better-auth/src/context/init.ts` - Context initialization

## Next Steps

1. ✅ Complete research and document findings
2. Get team feedback on proposed approach
3. Create implementation plan with task breakdown
4. Implement Phase 1 (Core Infrastructure)
5. Implement Phase 2 (OAuth2 Core)
6. Implement Phase 3 (Interface updates)
7. Implement Phase 4 (Social providers - can be done in batches)
8. Implement Phase 5 (Flow handlers)
9. Implement Phase 6 (Plugins)
10. Implement Phase 7 (Testing & Docs)
11. Open PR for review

## References

- Issue: https://github.com/better-auth/better-auth/issues/7396
- Next-Auth Corporate Proxy Guide: https://next-auth.js.org/tutorials/corporate-proxy
- AuthJS Corporate Proxy Guide: https://authjs.dev/guides/corporate-proxy
- Client-side implementation: `/packages/better-auth/src/client/config.ts`

## Estimated Effort

- Core Infrastructure: 2-4 hours
- OAuth2 Core: 3-5 hours
- Interface Updates: 1-2 hours
- Social Providers: 8-12 hours (34 providers × ~20 mins each)
- Flow Handlers: 2-4 hours (depends on how many)
- Plugins: 1-2 hours
- Testing: 4-6 hours
- Documentation: 2-3 hours

**Total Estimate:** 23-38 hours (roughly 3-5 days of focused work)

## Questions for Maintainers

1. Is there a preferred way to structure the `fetchOptions` type?
2. Should we support both global and per-provider fetch options?
3. Are there any existing patterns for passing context options deep into the OAuth flow?
4. Should this be considered a breaking change or can it be a minor version bump?
5. Are there any other places besides OAuth where server-side fetch customization would be useful?
