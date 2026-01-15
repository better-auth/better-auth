# Issue #7396: Implementation Example

This document shows concrete "before and after" code examples for implementing server-side `fetchOptions` support.

## Table of Contents
1. [Type Definitions](#1-type-definitions)
2. [OAuth2 Core Functions](#2-oauth2-core-functions)
3. [Provider Interface](#3-provider-interface)
4. [Social Provider Implementation](#4-social-provider-implementation)
5. [Flow Handler](#5-flow-handler)
6. [User-Facing API](#6-user-facing-api)

---

## 1. Type Definitions

### File: `/packages/core/src/types/init-options.ts`

```typescript
// BEFORE (excerpt)
export type BetterAuthOptions = {
  appName?: string | undefined;
  baseURL?: string | undefined;
  basePath?: string | undefined;
  secret?: string | undefined;
  database?: ... | undefined;
  // ... other options ...
  advanced?: BetterAuthAdvancedOptions | undefined;
  // ... rest ...
};
```

```typescript
// AFTER (with new fetchOptions)
export type BetterAuthOptions = {
  appName?: string | undefined;
  baseURL?: string | undefined;
  basePath?: string | undefined;
  secret?: string | undefined;
  database?: ... | undefined;
  // ... other options ...
  
  /**
   * Fetch options for server-side OAuth requests.
   * 
   * Configure fetch behavior for all outbound OAuth provider requests
   * including token exchange, token refresh, and user info fetching.
   * 
   * Useful for corporate proxy configuration and custom fetch implementations.
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
     * Custom fetch implementation to use for OAuth requests.
     * Defaults to the global fetch if not provided.
     */
    customFetchImpl?: typeof fetch;
    
    /**
     * Called before each OAuth request is sent.
     * Useful for logging or modifying requests.
     */
    onRequest?: (request: Request) => void | Promise<void>;
    
    /**
     * Called after each successful OAuth response.
     */
    onResponse?: (response: Response) => void | Promise<void>;
    
    /**
     * Called when an OAuth request fails.
     */
    onError?: (error: any) => void | Promise<void>;
    
    /**
     * Called after each successful OAuth response.
     * @deprecated Use onResponse instead
     */
    onSuccess?: (response: Response) => void | Promise<void>;
    
    /**
     * Additional fetch options to merge with each request.
     * Supports standard fetch options like headers, and
     * library-specific options like dispatcher (undici) or agent (node-fetch).
     */
    [key: string]: any;
  } | undefined;
  
  advanced?: BetterAuthAdvancedOptions | undefined;
  // ... rest ...
};
```

---

## 2. OAuth2 Core Functions

### File: `/packages/core/src/oauth2/validate-authorization-code.ts`

```typescript
// BEFORE
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
}: {
  code: string;
  redirectURI: string;
  options: Partial<ProviderOptions>;
  codeVerifier?: string | undefined;
  deviceId?: string | undefined;
  tokenEndpoint: string;
  authentication?: ("basic" | "post") | undefined;
  headers?: Record<string, string> | undefined;
  additionalParams?: Record<string, string> | undefined;
  resource?: (string | string[]) | undefined;
}) {
  const { body, headers: requestHeaders } = createAuthorizationCodeRequest({
    code,
    codeVerifier,
    redirectURI,
    options,
    authentication,
    deviceId,
    headers,
    additionalParams,
    resource,
  });

  const { data, error } = await betterFetch<object>(tokenEndpoint, {
    method: "POST",
    body: body,
    headers: requestHeaders,
  });

  if (error) {
    throw error;
  }
  const tokens = getOAuth2Tokens(data);
  return tokens;
}
```

```typescript
// AFTER (with fetchOptions support)
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
  code: string;
  redirectURI: string;
  options: Partial<ProviderOptions>;
  codeVerifier?: string | undefined;
  deviceId?: string | undefined;
  tokenEndpoint: string;
  authentication?: ("basic" | "post") | undefined;
  headers?: Record<string, string> | undefined;
  additionalParams?: Record<string, string> | undefined;
  resource?: (string | string[]) | undefined;
  fetchOptions?: Record<string, any> | undefined; // NEW
}) {
  const { body, headers: requestHeaders } = createAuthorizationCodeRequest({
    code,
    codeVerifier,
    redirectURI,
    options,
    authentication,
    deviceId,
    headers,
    additionalParams,
    resource,
  });

  const { data, error } = await betterFetch<object>(tokenEndpoint, {
    method: "POST",
    body: body,
    headers: requestHeaders,
    ...fetchOptions, // NEW: Merge custom fetch options
  });

  if (error) {
    throw error;
  }
  const tokens = getOAuth2Tokens(data);
  return tokens;
}
```

**Similar changes needed for:**
- `refreshAccessToken()` in `refresh-access-token.ts`
- `validateToken()` in `validate-authorization-code.ts`
- `getJwks()` in `verify.ts`
- `clientCredentialsToken()` in `client-credentials-token.ts`

---

## 3. Provider Interface

### File: `/packages/core/src/oauth2/oauth-provider.ts`

```typescript
// BEFORE
export interface OAuthProvider<
  T extends Record<string, any> = Record<string, any>,
  O extends Record<string, any> = Partial<ProviderOptions>,
> {
  id: LiteralString;
  createAuthorizationURL: (data: {
    state: string;
    codeVerifier: string;
    scopes?: string[] | undefined;
    redirectURI: string;
    display?: string | undefined;
    loginHint?: string | undefined;
  }) => Awaitable<URL>;
  name: string;
  validateAuthorizationCode: (data: {
    code: string;
    redirectURI: string;
    codeVerifier?: string | undefined;
    deviceId?: string | undefined;
  }) => Promise<OAuth2Tokens>;
  getUserInfo: (
    token: OAuth2Tokens & {
      user?: ... | undefined;
    },
  ) => Promise<{
    user: OAuth2UserInfo;
    data: T;
  } | null>;
  refreshAccessToken?:
    | ((refreshToken: string) => Promise<OAuth2Tokens>)
    | undefined;
  // ... rest ...
}
```

```typescript
// AFTER (with fetchOptions)
export interface OAuthProvider<
  T extends Record<string, any> = Record<string, any>,
  O extends Record<string, any> = Partial<ProviderOptions>,
> {
  id: LiteralString;
  createAuthorizationURL: (data: {
    state: string;
    codeVerifier: string;
    scopes?: string[] | undefined;
    redirectURI: string;
    display?: string | undefined;
    loginHint?: string | undefined;
  }) => Awaitable<URL>;
  name: string;
  validateAuthorizationCode: (data: {
    code: string;
    redirectURI: string;
    codeVerifier?: string | undefined;
    deviceId?: string | undefined;
    fetchOptions?: Record<string, any> | undefined; // NEW
  }) => Promise<OAuth2Tokens>;
  getUserInfo: (
    token: OAuth2Tokens & {
      user?: ... | undefined;
    },
    fetchOptions?: Record<string, any> | undefined, // NEW
  ) => Promise<{
    user: OAuth2UserInfo;
    data: T;
  } | null>;
  refreshAccessToken?:
    | ((
        refreshToken: string,
        fetchOptions?: Record<string, any> | undefined, // NEW
      ) => Promise<OAuth2Tokens>)
    | undefined;
  // ... rest ...
}
```

---

## 4. Social Provider Implementation

### File: `/packages/core/src/social-providers/github.ts`

```typescript
// BEFORE
export const github = (options: GithubOptions) => {
  const tokenEndpoint = "https://github.com/login/oauth/access_token";
  return {
    id: "github",
    name: "GitHub",
    createAuthorizationURL({ state, scopes, loginHint, codeVerifier, redirectURI }) {
      // ... implementation ...
    },
    validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
      return validateAuthorizationCode({
        code,
        codeVerifier,
        redirectURI,
        options,
        tokenEndpoint,
      });
    },
    refreshAccessToken: options.refreshAccessToken
      ? options.refreshAccessToken
      : async (refreshToken) => {
          return refreshAccessToken({
            refreshToken,
            options: {
              clientId: options.clientId,
              clientKey: options.clientKey,
              clientSecret: options.clientSecret,
            },
            tokenEndpoint: "https://github.com/login/oauth/access_token",
          });
        },
    async getUserInfo(token) {
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
        },
      );
      if (error) {
        return null;
      }
      const { data: emails } = await betterFetch<
        {
          email: string;
          primary: boolean;
          verified: boolean;
          visibility: "public" | "private";
        }[]
      >("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "User-Agent": "better-auth",
        },
      });
      // ... rest of implementation ...
    },
    options,
  } satisfies OAuthProvider<GithubProfile>;
};
```

```typescript
// AFTER (with fetchOptions support)
export const github = (options: GithubOptions) => {
  const tokenEndpoint = "https://github.com/login/oauth/access_token";
  return {
    id: "github",
    name: "GitHub",
    createAuthorizationURL({ state, scopes, loginHint, codeVerifier, redirectURI }) {
      // ... implementation unchanged ...
    },
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
        fetchOptions, // NEW: Pass through
      });
    },
    refreshAccessToken: options.refreshAccessToken
      ? options.refreshAccessToken
      : async (refreshToken, fetchOptions) => { // NEW: Accept fetchOptions
          return refreshAccessToken({
            refreshToken,
            options: {
              clientId: options.clientId,
              clientKey: options.clientKey,
              clientSecret: options.clientSecret,
            },
            tokenEndpoint: "https://github.com/login/oauth/access_token",
            fetchOptions, // NEW: Pass through
          });
        },
    async getUserInfo(token, fetchOptions) { // NEW: Accept fetchOptions
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
          ...fetchOptions, // NEW: Merge custom options
        },
      );
      if (error) {
        return null;
      }
      const { data: emails } = await betterFetch<
        {
          email: string;
          primary: boolean;
          verified: boolean;
          visibility: "public" | "private";
        }[]
      >("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "User-Agent": "better-auth",
        },
        ...fetchOptions, // NEW: Merge custom options
      });
      // ... rest of implementation unchanged ...
    },
    options,
  } satisfies OAuthProvider<GithubProfile>;
};
```

---

## 5. Flow Handler

### Example Location: `/packages/better-auth/src/api/routes/oauth.ts` (or wherever OAuth flows are handled)

```typescript
// BEFORE (pseudo-code)
async function handleOAuthCallback(ctx: AuthContext, code: string, state: string) {
  const provider = getProvider(ctx.providerId);
  
  // Validate authorization code
  const tokens = await provider.validateAuthorizationCode({
    code,
    redirectURI: ctx.redirectURI,
    codeVerifier: state.codeVerifier,
  });
  
  // Get user info
  const userInfo = await provider.getUserInfo(tokens);
  
  // Create/update user and session
  // ...
}
```

```typescript
// AFTER (with fetchOptions from context)
async function handleOAuthCallback(ctx: AuthContext, code: string, state: string) {
  const provider = getProvider(ctx.providerId);
  
  // Validate authorization code
  const tokens = await provider.validateAuthorizationCode({
    code,
    redirectURI: ctx.redirectURI,
    codeVerifier: state.codeVerifier,
    fetchOptions: ctx.options.fetchOptions, // NEW: Pass from context
  });
  
  // Get user info
  const userInfo = await provider.getUserInfo(
    tokens,
    ctx.options.fetchOptions, // NEW: Pass from context
  );
  
  // Create/update user and session
  // ...
}
```

---

## 6. User-Facing API

### Corporate Proxy Example

```typescript
// File: auth.ts (user's application)
import { betterAuth } from "better-auth";
import { ProxyAgent } from "undici";

export const auth = betterAuth({
  database: {
    // ... database config ...
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  // NEW: Configure fetch options for OAuth requests
  fetchOptions: {
    // Use corporate proxy for all OAuth requests
    dispatcher: new ProxyAgent(process.env.CORPORATE_PROXY_URL!),
  },
});
```

### With Request Logging

```typescript
import { betterAuth } from "better-auth";
import { ProxyAgent } from "undici";

export const auth = betterAuth({
  database: { /* ... */ },
  socialProviders: { /* ... */ },
  fetchOptions: {
    // Corporate proxy
    dispatcher: new ProxyAgent(process.env.CORPORATE_PROXY_URL!),
    
    // Log all OAuth requests
    onRequest: async (request) => {
      console.log(`[OAuth] ${request.method} ${request.url}`);
    },
    
    // Log successful responses
    onResponse: async (response) => {
      console.log(`[OAuth] Response: ${response.status}`);
    },
    
    // Log errors
    onError: async (error) => {
      console.error(`[OAuth] Error:`, error);
    },
  },
});
```

### With Custom Headers

```typescript
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  database: { /* ... */ },
  socialProviders: { /* ... */ },
  fetchOptions: {
    // Add custom headers to all OAuth requests
    headers: {
      'User-Agent': 'MyApp/1.0.0',
      'X-Request-ID': () => generateRequestId(),
    },
  },
});
```

### With Custom Fetch Implementation

```typescript
import { betterAuth } from "better-auth";
import customFetch from "some-custom-fetch-library";

export const auth = betterAuth({
  database: { /* ... */ },
  socialProviders: { /* ... */ },
  fetchOptions: {
    // Use completely custom fetch implementation
    customFetchImpl: customFetch,
  },
});
```

---

## Testing Example

```typescript
import { describe, it, expect, vi } from 'vitest';
import { validateAuthorizationCode } from '@better-auth/core/oauth2';
import { ProxyAgent } from 'undici';

describe('fetchOptions support', () => {
  it('should pass fetchOptions to betterFetch', async () => {
    const mockDispatcher = new ProxyAgent('http://proxy.test:8080');
    
    const tokens = await validateAuthorizationCode({
      code: 'test_code',
      redirectURI: 'http://localhost:3000/callback',
      options: {
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
      },
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      fetchOptions: {
        dispatcher: mockDispatcher,
      },
    });
    
    // Verify tokens were returned
    expect(tokens).toBeDefined();
    expect(tokens.accessToken).toBeTruthy();
  });
  
  it('should call onRequest hook', async () => {
    const onRequest = vi.fn();
    
    await validateAuthorizationCode({
      code: 'test_code',
      redirectURI: 'http://localhost:3000/callback',
      options: {
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
      },
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      fetchOptions: {
        onRequest,
      },
    });
    
    // Verify hook was called
    expect(onRequest).toHaveBeenCalledOnce();
  });
});
```

---

## Summary of Changes

### Files Modified: ~45-50 files

1. **Type definitions** (1-2 files)
   - Add `fetchOptions` to `BetterAuthOptions`
   - Update `AuthContext` interface

2. **OAuth2 core** (5 files)
   - `validate-authorization-code.ts`
   - `refresh-access-token.ts`
   - `verify.ts`
   - `client-credentials-token.ts`
   - `oauth-provider.ts`

3. **Social providers** (34 files)
   - All providers in `/packages/core/src/social-providers/`

4. **Flow handlers** (2-5 files, TBD)
   - Wherever OAuth flows are initiated

5. **Plugins** (1-2 files)
   - Generic OAuth plugin
   - Any other plugins making OAuth requests

6. **Tests** (10-15 new test files)
   - Unit tests for core functions
   - Integration tests for providers
   - End-to-end tests with proxy

7. **Documentation** (3-5 files)
   - API reference
   - Corporate proxy guide
   - Migration guide (minimal, as it's additive)

### Pattern Summary

Every OAuth-related function needs:
1. Accept optional `fetchOptions` parameter
2. Pass `fetchOptions` to `betterFetch` using spread operator
3. Pass `fetchOptions` to any downstream OAuth functions

Every OAuth flow handler needs:
1. Access `fetchOptions` from `ctx.options.fetchOptions`
2. Pass to provider methods

---

## Backward Compatibility

✅ **100% Backward Compatible**

- `fetchOptions` is optional (undefined by default)
- All existing code works without changes
- No breaking changes to any APIs
- New parameter is always optional and at the end

---

## Next Steps

1. Get maintainer approval on this approach
2. Implement Phase 1 (types and context)
3. Implement Phase 2 (OAuth2 core)
4. Implement Phase 3-6 (providers, handlers, plugins)
5. Write tests
6. Write documentation
7. Submit PR

---

**Note:** This is a comprehensive but straightforward change. The pattern is consistent across all files, making it relatively mechanical to implement once the foundation is in place.
