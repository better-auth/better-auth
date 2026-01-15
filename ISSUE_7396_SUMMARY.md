# Issue #7396 Summary: Server-side fetchOptions Support

## Quick Overview

**What:** Add `fetchOptions` parameter to server-side `betterAuth()` configuration

**Why:** Enable corporate proxy support and custom fetch implementations for OAuth requests

**Impact:** ~40 files need modification, estimated 3-5 days of work

**Breaking:** No - fully backward compatible

## Key Findings

### 1. The Gap

- ✅ Client-side (`createAuthClient`): Has `fetchOptions` support
- ❌ Server-side (`betterAuth`): No fetch customization available
- 🎯 All OAuth requests use `betterFetch` without customization options

### 2. Where OAuth Requests Happen

```
betterAuth()
  ├── Social Providers (34 files)
  │   ├── validateAuthorizationCode()
  │   ├── refreshAccessToken()
  │   └── getUserInfo()
  │
  ├── OAuth2 Core (5 files)
  │   ├── validate-authorization-code.ts
  │   ├── refresh-access-token.ts
  │   ├── verify.ts (JWKS)
  │   ├── client-credentials-token.ts
  │   └── utils.ts
  │
  └── Generic OAuth Plugin
      └── Uses OAuth2 core functions
```

### 3. Corporate Proxy Use Case

**Problem:**
```typescript
// User behind corporate proxy wants to do:
import { ProxyAgent } from 'undici';

betterAuth({
  // ❌ This doesn't exist yet
  fetchOptions: {
    dispatcher: new ProxyAgent('http://proxy.company.com:8080')
  }
})
```

**Current Workaround:**
None! Users are stuck.

**Next-Auth Solution:**
They allowed customizing the OpenID client:
```javascript
// Next-Auth v4
providers: [
  {
    ...GoogleProvider({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      httpOptions: {
        agent: new HttpsProxyAgent(process.env.PROXY_URL)
      }
    })
  }
]
```

## Proposed Solution

### API Design

```typescript
// Type definition
export type BetterAuthOptions = {
  // ... existing options ...
  
  /**
   * Fetch options for server-side OAuth requests.
   * Applied to all outbound requests (token exchange, refresh, user info, etc.)
   */
  fetchOptions?: {
    /**
     * Custom fetch implementation
     */
    customFetchImpl?: typeof fetch;
    
    /**
     * Lifecycle hooks
     */
    onRequest?: (request: Request) => void | Promise<void>;
    onResponse?: (response: Response) => void | Promise<void>;
    onError?: (error: any) => void | Promise<void>;
    onSuccess?: (response: Response) => void | Promise<void>;
    
    /**
     * Standard fetch options (merged with request-specific options)
     * Supports: headers, dispatcher (undici), agent (node-fetch), etc.
     */
    [key: string]: any;
  } | undefined;
};

// Usage example
import { ProxyAgent } from 'undici';

export const auth = betterAuth({
  database: ...,
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }
  },
  // NEW: Custom fetch options for OAuth requests
  fetchOptions: {
    // Corporate proxy
    dispatcher: new ProxyAgent('http://proxy.company.com:8080'),
    
    // Optional: Custom headers for all OAuth requests
    headers: {
      'X-Custom-Header': 'value'
    },
    
    // Optional: Lifecycle hooks
    onRequest: async (req) => {
      console.log('OAuth request:', req.url);
    }
  }
});
```

### Implementation Strategy

**Phase 1: Foundation (2-4 hours)**
```typescript
// 1. Add type to BetterAuthOptions
// Location: /packages/core/src/types/init-options.ts

// 2. Store in AuthContext
// Location: Wherever AuthContext is defined

// 3. Pass through initialization
// Location: /packages/better-auth/src/context/init.ts
```

**Phase 2: OAuth2 Core (3-5 hours)**
```typescript
// Update 5 core OAuth2 files to accept and use fetchOptions:
- validate-authorization-code.ts
- refresh-access-token.ts
- verify.ts
- client-credentials-token.ts
- utils.ts (if needed)

// Pattern:
export async function validateAuthorizationCode({
  // ... existing params ...
  fetchOptions, // NEW
}: {
  // ... existing types ...
  fetchOptions?: Record<string, any> | undefined; // NEW
}) {
  const { data, error } = await betterFetch(tokenEndpoint, {
    method: "POST",
    body: body,
    headers: requestHeaders,
    ...fetchOptions, // Merge custom options
  });
  // ... rest
}
```

**Phase 3: Provider Interface (1-2 hours)**
```typescript
// Update OAuthProvider interface
// Location: /packages/core/src/oauth2/oauth-provider.ts

export interface OAuthProvider<T, O> {
  validateAuthorizationCode: (data: {
    // ... existing ...
    fetchOptions?: Record<string, any> | undefined; // NEW
  }) => Promise<OAuth2Tokens>;
  
  getUserInfo: (
    token: OAuth2Tokens,
    fetchOptions?: Record<string, any> | undefined, // NEW
  ) => Promise<...>;
  
  refreshAccessToken?: (
    refreshToken: string,
    fetchOptions?: Record<string, any> | undefined, // NEW
  ) => Promise<OAuth2Tokens>;
}
```

**Phase 4: Social Providers (8-12 hours)**
```typescript
// Update all 34 providers to:
// 1. Accept fetchOptions parameter
// 2. Pass to OAuth2 core functions
// 3. Pass to their own betterFetch calls

// Example for GitHub:
export const github = (options: GithubOptions) => ({
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
  
  async getUserInfo(token, fetchOptions) { // NEW param
    const { data: profile } = await betterFetch(
      "https://api.github.com/user",
      {
        headers: { authorization: `Bearer ${token.accessToken}` },
        ...fetchOptions, // Merge
      }
    );
    // ...
  },
});

// Repeat for all providers:
// apple, atlassian, cognito, discord, dropbox, facebook, figma,
// github, gitlab, google, huggingface, kakao, kick, line, linear,
// linkedin, microsoft-entra-id, naver, notion, paybin, paypal,
// polar, reddit, roblox, salesforce, slack, spotify, tiktok,
// twitch, twitter, vercel, vk, zoom
```

**Phase 5: Flow Handlers (2-4 hours)**
```typescript
// Update OAuth flow initiation points to pass fetchOptions from context
// Need to identify these locations (likely in api/routes or similar)

// Pattern:
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

**Phase 6: Plugins (1-2 hours)**
```typescript
// Update generic OAuth plugin
// Location: /packages/better-auth/src/plugins/generic-oauth/
```

**Phase 7: Polish (6-9 hours)**
- Unit tests for fetch option passing
- Integration test with actual proxy
- Documentation with examples
- Update TypeScript exports

## Files to Modify

### Core (7 files)
1. `/packages/core/src/types/init-options.ts` - Add `fetchOptions` type
2. `/packages/core/src/types/context.ts` (or similar) - Update `AuthContext`
3. `/packages/core/src/oauth2/validate-authorization-code.ts`
4. `/packages/core/src/oauth2/refresh-access-token.ts`
5. `/packages/core/src/oauth2/verify.ts`
6. `/packages/core/src/oauth2/client-credentials-token.ts`
7. `/packages/core/src/oauth2/oauth-provider.ts`

### Social Providers (34 files)
All files in `/packages/core/src/social-providers/`:
- apple.ts, atlassian.ts, cognito.ts, discord.ts, dropbox.ts
- facebook.ts, figma.ts, github.ts, gitlab.ts, google.ts
- huggingface.ts, kakao.ts, kick.ts, line.ts, linear.ts
- linkedin.ts, microsoft-entra-id.ts, naver.ts, notion.ts
- paybin.ts, paypal.ts, polar.ts, reddit.ts, roblox.ts
- salesforce.ts, slack.ts, spotify.ts, tiktok.ts, twitch.ts
- twitter.ts, vercel.ts, vk.ts, zoom.ts

### Flow Handlers (TBD - need to identify)
- Likely in `/packages/better-auth/src/api/routes/` or similar
- Wherever OAuth flows are initiated

### Plugins (1+ files)
- `/packages/better-auth/src/plugins/generic-oauth/`

### Tests & Docs
- New test files
- Documentation updates

**Total: ~45-50 files**

## Testing Strategy

### Unit Tests
```typescript
describe('fetchOptions passing', () => {
  it('should pass fetchOptions to validateAuthorizationCode', async () => {
    const mockFetch = vi.fn();
    await validateAuthorizationCode({
      // ... params ...
      fetchOptions: { customFetchImpl: mockFetch }
    });
    expect(mockFetch).toHaveBeenCalled();
  });
  
  // Similar tests for other OAuth operations
});
```

### Integration Tests
```typescript
describe('corporate proxy support', () => {
  it('should use ProxyAgent for OAuth requests', async () => {
    const proxyAgent = new ProxyAgent('http://localhost:8080');
    const auth = betterAuth({
      fetchOptions: { dispatcher: proxyAgent }
    });
    
    // Test OAuth flow
    // Verify requests go through proxy
  });
});
```

### Manual Testing
1. Set up local proxy (e.g., mitmproxy)
2. Configure Better Auth with proxy settings
3. Test OAuth flow with GitHub/Google
4. Verify requests go through proxy

## Documentation Plan

### 1. API Reference
```markdown
## fetchOptions

Configure fetch behavior for server-side OAuth requests.

### Type
```typescript
fetchOptions?: {
  customFetchImpl?: typeof fetch;
  onRequest?: (request: Request) => void | Promise<void>;
  onResponse?: (response: Response) => void | Promise<void>;
  onError?: (error: any) => void | Promise<void>;
  onSuccess?: (response: Response) => void | Promise<void>;
  [key: string]: any;
} | undefined;
```

### Examples

#### Corporate Proxy (undici)
```typescript
import { ProxyAgent } from 'undici';

betterAuth({
  fetchOptions: {
    dispatcher: new ProxyAgent(process.env.PROXY_URL)
  }
})
```

#### Corporate Proxy (node-fetch with https-proxy-agent)
```typescript
import { HttpsProxyAgent } from 'https-proxy-agent';

betterAuth({
  fetchOptions: {
    agent: new HttpsProxyAgent(process.env.PROXY_URL)
  }
})
```

#### Custom Headers
```typescript
betterAuth({
  fetchOptions: {
    headers: {
      'User-Agent': 'MyApp/1.0',
      'X-Custom-Header': 'value'
    }
  }
})
```

#### Request Logging
```typescript
betterAuth({
  fetchOptions: {
    onRequest: (req) => {
      console.log('OAuth request:', req.url);
    },
    onError: (error) => {
      console.error('OAuth error:', error);
    }
  }
})
```
```

### 2. Guide: Corporate Proxy Setup
- Problem description
- Solution comparison (vs Next-Auth)
- Step-by-step setup
- Common issues and troubleshooting

## Migration Guide

**No migration needed!** This is a purely additive feature.

Users can opt-in by adding `fetchOptions` to their config:

```typescript
// Before (works unchanged)
export const auth = betterAuth({
  database: ...,
  socialProviders: { ... }
});

// After (optional enhancement)
export const auth = betterAuth({
  database: ...,
  socialProviders: { ... },
  fetchOptions: { ... } // NEW
});
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes in OAuth flows | High | Extensive testing, backward compatibility checks |
| Security vulnerabilities from custom fetch | Medium | Documentation warnings, security best practices |
| Performance degradation | Low | Minimal overhead, only when configured |
| Maintenance burden | Medium | Clear patterns, consistent implementation |
| Provider-specific edge cases | Medium | Test with multiple providers |

## Success Criteria

1. ✅ User can configure corporate proxy for OAuth
2. ✅ All 34 social providers support fetchOptions
3. ✅ Generic OAuth plugin supports fetchOptions
4. ✅ No breaking changes to existing code
5. ✅ Comprehensive test coverage
6. ✅ Clear documentation with examples
7. ✅ Type safety maintained

## Alternative Considered: Global fetch Override

```typescript
// Alternative: Set global fetch implementation
global.fetch = customFetch;

betterAuth({ ... });
```

**Pros:**
- Simpler implementation
- No code changes needed

**Cons:**
- Affects all fetch calls, not just OAuth
- Less flexible
- Harder to test
- Poor developer experience

**Decision:** Rejected in favor of explicit fetchOptions

## Timeline Estimate

| Phase | Hours | Days |
|-------|-------|------|
| Phase 1: Foundation | 2-4 | 0.5 |
| Phase 2: OAuth2 Core | 3-5 | 0.5-1 |
| Phase 3: Interface | 1-2 | 0.25 |
| Phase 4: Providers | 8-12 | 1-1.5 |
| Phase 5: Handlers | 2-4 | 0.5 |
| Phase 6: Plugins | 1-2 | 0.25 |
| Phase 7: Polish | 6-9 | 1 |
| **Total** | **23-38** | **3-5** |

## Next Actions

1. ✅ Complete research
2. ⏳ Get maintainer feedback on approach
3. ⏳ Start with Phase 1 implementation
4. ⏳ Iterative implementation and testing
5. ⏳ Documentation
6. ⏳ PR and review

## Questions for Maintainers

1. **API Design**: Is the proposed `fetchOptions` structure acceptable?
2. **Scope**: Should we support per-provider fetchOptions or only global?
3. **Context**: How should fetchOptions be passed through the context?
4. **Version**: Minor version bump or patch?
5. **Priority**: Should this be fast-tracked given corporate users are blocked?
6. **OIDC**: Are there OIDC-specific considerations?
7. **SSO**: Do SSO plugins need similar support?

## References

- Issue: https://github.com/better-auth/better-auth/issues/7396
- Research Doc: `/workspace/RESEARCH_ISSUE_7396.md`
- Client-side implementation: `/packages/better-auth/src/client/config.ts`
- Next-Auth docs: https://next-auth.js.org/tutorials/corporate-proxy

---

**Status:** Research Complete ✅  
**Ready for:** Maintainer Review and Implementation Planning
