# Issue #7396: Data Flow Diagram

This document visualizes how `fetchOptions` flows through the system.

## Current State (Without fetchOptions)

```
┌─────────────────────────────────────────────────────────────────┐
│ User Code                                                       │
│                                                                 │
│  betterAuth({                                                   │
│    database: {...},                                             │
│    socialProviders: {                                           │
│      github: { clientId, clientSecret }                         │
│    }                                                            │
│  })                                                             │
│                                                                 │
│  ❌ No way to configure proxy or custom fetch                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ betterAuth() Initialization                                     │
│                                                                 │
│  - Options: BetterAuthOptions                                   │
│  - No fetchOptions field ❌                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AuthContext                                                     │
│                                                                 │
│  - options: BetterAuthOptions                                   │
│  - adapter, baseURL, etc.                                       │
│  - ❌ No fetchOptions available                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ OAuth Flow Handler                                              │
│                                                                 │
│  const tokens = await provider.validateAuthorizationCode({     │
│    code,                                                        │
│    redirectURI,                                                 │
│    codeVerifier                                                 │
│    // ❌ Can't pass fetchOptions                                │
│  });                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Social Provider (e.g., GitHub)                                  │
│                                                                 │
│  validateAuthorizationCode: async ({ code, ... }) => {         │
│    return validateAuthorizationCode({                           │
│      code, options, tokenEndpoint                               │
│      // ❌ No fetchOptions parameter                            │
│    });                                                          │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ OAuth2 Core (validateAuthorizationCode)                        │
│                                                                 │
│  const { data } = await betterFetch(tokenEndpoint, {           │
│    method: "POST",                                              │
│    body: body,                                                  │
│    headers: requestHeaders                                      │
│    // ❌ No custom fetch options                                │
│  });                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ betterFetch (from @better-fetch/fetch)                         │
│                                                                 │
│  - Uses global fetch                                            │
│  - ❌ No proxy configuration                                    │
│  - ❌ Fails for users behind corporate proxy                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                        ❌ REQUEST FAILS
                   (Corporate Proxy Blocks)
```

---

## Proposed State (With fetchOptions)

```
┌─────────────────────────────────────────────────────────────────┐
│ User Code                                                       │
│                                                                 │
│  import { ProxyAgent } from 'undici';                           │
│                                                                 │
│  betterAuth({                                                   │
│    database: {...},                                             │
│    socialProviders: {                                           │
│      github: { clientId, clientSecret }                         │
│    },                                                           │
│    fetchOptions: {                              ┐               │
│      dispatcher: new ProxyAgent(PROXY_URL)      │ NEW ✨        │
│    }                                            ┘               │
│  })                                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ betterAuth() Initialization                                     │
│                                                                 │
│  - Options: BetterAuthOptions                                   │
│  - ✅ fetchOptions: { dispatcher: ProxyAgent }                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AuthContext                                                     │
│                                                                 │
│  - options: {                                                   │
│      ...otherOptions,                                           │
│      fetchOptions: { dispatcher: ProxyAgent } ✅                │
│    }                                                            │
│  - adapter, baseURL, etc.                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ OAuth Flow Handler                                              │
│                                                                 │
│  const tokens = await provider.validateAuthorizationCode({     │
│    code,                                                        │
│    redirectURI,                                                 │
│    codeVerifier,                                                │
│    fetchOptions: ctx.options.fetchOptions  ← PASS FROM CTX ✅   │
│  });                                                            │
│                                                                 │
│  const userInfo = await provider.getUserInfo(                  │
│    tokens,                                                      │
│    ctx.options.fetchOptions                ← PASS FROM CTX ✅   │
│  );                                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Social Provider (e.g., GitHub)                                  │
│                                                                 │
│  validateAuthorizationCode: async ({                            │
│    code,                                                        │
│    redirectURI,                                                 │
│    fetchOptions  ← ACCEPT PARAMETER ✅                          │
│  }) => {                                                        │
│    return validateAuthorizationCode({                           │
│      code,                                                      │
│      redirectURI,                                               │
│      options,                                                   │
│      tokenEndpoint,                                             │
│      fetchOptions  ← PASS THROUGH ✅                            │
│    });                                                          │
│  },                                                             │
│                                                                 │
│  getUserInfo: async (token, fetchOptions) {  ← ACCEPT PARAM ✅  │
│    const { data } = await betterFetch(url, {                   │
│      headers: {...},                                            │
│      ...fetchOptions  ← MERGE ✅                                │
│    });                                                          │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ OAuth2 Core (validateAuthorizationCode)                        │
│                                                                 │
│  async function validateAuthorizationCode({                     │
│    code,                                                        │
│    tokenEndpoint,                                               │
│    options,                                                     │
│    fetchOptions  ← ACCEPT PARAMETER ✅                          │
│  }) {                                                           │
│    const { data } = await betterFetch(tokenEndpoint, {         │
│      method: "POST",                                            │
│      body: body,                                                │
│      headers: requestHeaders,                                   │
│      ...fetchOptions  ← MERGE ✅                                │
│    });                                                          │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ betterFetch (from @better-fetch/fetch)                         │
│                                                                 │
│  - Receives: {                                                  │
│      method: "POST",                                            │
│      headers: {...},                                            │
│      body: {...},                                               │
│      dispatcher: ProxyAgent  ← FROM fetchOptions ✅             │
│    }                                                            │
│                                                                 │
│  - Uses ProxyAgent for request                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ ProxyAgent (undici)                                             │
│                                                                 │
│  - Connects through corporate proxy                             │
│  - Forwards request to OAuth provider                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Corporate Proxy                                                 │
│                                                                 │
│  - Authenticates request                                        │
│  - Forwards to OAuth provider (GitHub, Google, etc.)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ OAuth Provider (e.g., github.com)                              │
│                                                                 │
│  - Receives token exchange request                              │
│  - Returns access token                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                        ✅ REQUEST SUCCEEDS!
```

---

## Multi-Provider Flow

Shows how `fetchOptions` applies to all providers:

```
┌──────────────────────────────────────┐
│ betterAuth({                         │
│   fetchOptions: {                    │
│     dispatcher: ProxyAgent           │
│   },                                 │
│   socialProviders: {                 │
│     github: {...},                   │
│     google: {...},                   │
│     facebook: {...}                  │
│   }                                  │
│ })                                   │
└──────────────────────────────────────┘
               │
               │ Creates
               ▼
┌──────────────────────────────────────┐
│ AuthContext                          │
│  options.fetchOptions: {             │
│    dispatcher: ProxyAgent            │
│  }                                   │
└──────────────────────────────────────┘
               │
               │ Passed to all OAuth flows
               ├─────────────┬─────────────┐
               ▼             ▼             ▼
         ┌─────────┐   ┌─────────┐   ┌──────────┐
         │ GitHub  │   │ Google  │   │ Facebook │
         │ Provider│   │ Provider│   │ Provider │
         └─────────┘   └─────────┘   └──────────┘
               │             │             │
               │ All receive │ fetchOptions│
               ▼             ▼             ▼
         ┌─────────┐   ┌─────────┐   ┌──────────┐
         │  Token  │   │  Token  │   │  Token   │
         │ Exchange│   │ Exchange│   │ Exchange │
         └─────────┘   └─────────┘   └──────────┘
               │             │             │
               │             │             │
               ▼             ▼             ▼
         ┌──────────────────────────────────────┐
         │     All requests use ProxyAgent      │
         │            ✅ Unified config          │
         └──────────────────────────────────────┘
```

---

## Lifecycle Hooks Flow

Shows how lifecycle hooks are called:

```
User makes OAuth request
         │
         ▼
┌─────────────────────────────────────────┐
│ OAuth Flow Handler                      │
│ - Gets fetchOptions from context        │
│ - Passes to provider                    │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ OAuth2 Core (e.g., validateAuthCode)   │
│                                         │
│ fetchOptions = {                        │
│   dispatcher: ProxyAgent,               │
│   onRequest: (req) => {...},           │
│   onResponse: (res) => {...},          │
│   onError: (err) => {...}              │
│ }                                       │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ betterFetch                             │
│                                         │
│ 1. ✅ Call onRequest(request)           │
│                                         │
│ 2. Execute fetch with dispatcher        │
│                                         │
│ 3a. On success:                         │
│     ✅ Call onResponse(response)        │
│                                         │
│ 3b. On error:                           │
│     ✅ Call onError(error)              │
└─────────────────────────────────────────┘
         │
         ▼
    Return result
```

---

## Type Flow

Shows how TypeScript types flow through the system:

```
┌────────────────────────────────────────────────┐
│ BetterAuthOptions                              │
│                                                │
│ type BetterAuthOptions = {                     │
│   database?: ...,                              │
│   socialProviders?: ...,                       │
│   fetchOptions?: {                  ┐          │
│     customFetchImpl?: typeof fetch, │          │
│     onRequest?: ...,                │ NEW ✨   │
│     onResponse?: ...,               │          │
│     onError?: ...,                  │          │
│     [key: string]: any              │          │
│   } | undefined                     ┘          │
│ }                                              │
└────────────────────────────────────────────────┘
                    │
                    │ Used by
                    ▼
┌────────────────────────────────────────────────┐
│ AuthContext                                    │
│                                                │
│ interface AuthContext {                        │
│   options: BetterAuthOptions,                  │
│   adapter: ...,                                │
│   ...                                          │
│ }                                              │
│                                                │
│ ctx.options.fetchOptions ← Accessible ✅       │
└────────────────────────────────────────────────┘
                    │
                    │ Passed to
                    ▼
┌────────────────────────────────────────────────┐
│ OAuthProvider Interface                        │
│                                                │
│ interface OAuthProvider {                      │
│   validateAuthorizationCode: (data: {         │
│     code: string,                              │
│     redirectURI: string,                       │
│     fetchOptions?: Record<string, any>  ┐ NEW  │
│   }) => Promise<OAuth2Tokens>,          ┘      │
│                                                │
│   getUserInfo: (                               │
│     token: OAuth2Tokens,                       │
│     fetchOptions?: Record<string, any>  ┐ NEW  │
│   ) => Promise<...>,                    ┘      │
│   ...                                          │
│ }                                              │
└────────────────────────────────────────────────┘
                    │
                    │ Implemented by
                    ▼
┌────────────────────────────────────────────────┐
│ Social Provider (34x)                          │
│                                                │
│ - github.ts                                    │
│ - google.ts                                    │
│ - facebook.ts                                  │
│ - ... (31 more)                                │
│                                                │
│ All implement OAuthProvider interface          │
│ All accept and pass fetchOptions ✅            │
└────────────────────────────────────────────────┘
```

---

## Implementation Phases Visualization

```
Phase 1: Foundation
┌─────────────────────────────────────────────────┐
│ ✨ Add fetchOptions to BetterAuthOptions        │
│ ✨ Update AuthContext to store fetchOptions     │
│ ✨ Initialize fetchOptions in context           │
└─────────────────────────────────────────────────┘
                    ▼
Phase 2: OAuth2 Core
┌─────────────────────────────────────────────────┐
│ ✨ validateAuthorizationCode accepts/uses       │
│ ✨ refreshAccessToken accepts/uses              │
│ ✨ validateToken accepts/uses                   │
│ ✨ getJwks accepts/uses                         │
│ ✨ clientCredentialsToken accepts/uses          │
└─────────────────────────────────────────────────┘
                    ▼
Phase 3: Provider Interface
┌─────────────────────────────────────────────────┐
│ ✨ Update OAuthProvider interface               │
│ ✨ Add fetchOptions to method signatures        │
└─────────────────────────────────────────────────┘
                    ▼
Phase 4: Social Providers (34x)
┌─────────────────────────────────────────────────┐
│ ✨ Batch 1: github, google, facebook... (6)     │
│ ✨ Batch 2: okta, auth0, cognito... (6)         │
│ ✨ Batch 3: twitter, reddit, tiktok... (6)      │
│ ✨ Batch 4: notion, figma, linear... (6)        │
│ ✨ Batch 5: Remaining providers... (10)         │
└─────────────────────────────────────────────────┘
                    ▼
Phase 5: Flow Handlers
┌─────────────────────────────────────────────────┐
│ ✨ Update OAuth flow handlers                   │
│ ✨ Pass ctx.options.fetchOptions to providers   │
└─────────────────────────────────────────────────┘
                    ▼
Phase 6: Plugins
┌─────────────────────────────────────────────────┐
│ ✨ Update generic OAuth plugin                  │
│ ✨ Update any other OAuth-using plugins         │
└─────────────────────────────────────────────────┘
                    ▼
Phase 7: Testing & Docs
┌─────────────────────────────────────────────────┐
│ ✨ Unit tests for all modified functions        │
│ ✨ Integration tests with real proxy            │
│ ✨ API documentation                            │
│ ✨ Corporate proxy guide                        │
│ ✨ Examples                                     │
└─────────────────────────────────────────────────┘
                    ▼
              ✅ COMPLETE
```

---

## Testing Flow

```
Developer writes test
         │
         ▼
┌─────────────────────────────────────────┐
│ Create mock ProxyAgent                  │
│                                         │
│ const mockAgent = {                     │
│   dispatch: vi.fn()                     │
│ };                                      │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Pass to betterAuth                      │
│                                         │
│ betterAuth({                            │
│   fetchOptions: {                       │
│     dispatcher: mockAgent               │
│   }                                     │
│ })                                      │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Trigger OAuth flow                      │
│                                         │
│ await auth.api.signInSocial({           │
│   provider: 'github'                    │
│ })                                      │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Verify mock was called                  │
│                                         │
│ expect(mockAgent.dispatch)              │
│   .toHaveBeenCalled();                  │
│                                         │
│ ✅ Test passes = fetchOptions used      │
└─────────────────────────────────────────┘
```

---

## Summary

### Key Flow Points:

1. **User Configuration** ← User provides `fetchOptions` in `betterAuth()` config
2. **Context Storage** ← `fetchOptions` stored in `AuthContext`
3. **Flow Handler** ← Retrieves `fetchOptions` from context
4. **Provider Layer** ← Accepts and passes `fetchOptions` through
5. **OAuth2 Core** ← Merges `fetchOptions` with request options
6. **betterFetch** ← Executes request with custom options (proxy, hooks, etc.)

### Implementation Pattern:

Every layer follows the same pattern:
1. **Accept** `fetchOptions` as optional parameter
2. **Pass** to next layer (or merge with betterFetch options)
3. **Preserve** type safety throughout

### Result:

✅ Users can configure proxy once at the top level  
✅ Configuration flows through all OAuth operations  
✅ Works with all 34 social providers  
✅ Fully backward compatible (fetchOptions is optional)  
✅ Type-safe throughout the stack
