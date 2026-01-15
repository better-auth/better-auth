# Issue #7396: Edge Cases and Considerations

This document explores edge cases, potential issues, and solutions for implementing server-side `fetchOptions` support.

## Table of Contents
1. [Provider-Specific Edge Cases](#1-provider-specific-edge-cases)
2. [Security Considerations](#2-security-considerations)
3. [Performance Considerations](#3-performance-considerations)
4. [Error Handling](#4-error-handling)
5. [Compatibility Issues](#5-compatibility-issues)
6. [Testing Challenges](#6-testing-challenges)
7. [Documentation Pitfalls](#7-documentation-pitfalls)

---

## 1. Provider-Specific Edge Cases

### 1.1 Custom getUserInfo Implementation

**Issue:** Some providers allow users to pass custom `getUserInfo` functions through options.

```typescript
// Provider options
{
  getUserInfo: async (token) => {
    // Custom implementation
    return customFetch('https://api.example.com/user', {
      headers: { authorization: `Bearer ${token.accessToken}` }
    });
  }
}
```

**Problem:** Custom implementations won't receive `fetchOptions` automatically.

**Solutions:**

**Option A:** Document that custom implementations should use global fetch configuration
```typescript
// User's code
global.fetch = customFetchWithProxy;

// Their custom getUserInfo will use the custom fetch
```

**Option B:** Pass fetchOptions through provider options
```typescript
export type ProviderOptions = {
  // ... existing options ...
  getUserInfo?: (
    token: OAuth2Tokens,
    fetchOptions?: Record<string, any> // NEW
  ) => Promise<{ user: {...}; data: any; } | null>;
};
```

**Recommendation:** Option B - More explicit and flexible

---

### 1.2 Multi-Step OAuth Flows

**Issue:** Some providers (like Apple, Microsoft) make multiple requests during authentication:
1. Token exchange
2. JWKS fetching for ID token verification
3. User info fetching (sometimes)
4. Profile photo fetching (Microsoft)

**Example:**
```typescript
// Microsoft Entra ID
async getUserInfo(token, fetchOptions) {
  const user = decodeJwt(token.idToken);
  
  // Additional request for profile photo
  await betterFetch(
    `https://graph.microsoft.com/v1.0/me/photos/48x48/$value`,
    {
      headers: { authorization: `Bearer ${token.accessToken}` },
      ...fetchOptions, // Must merge here too!
    }
  );
}
```

**Solution:** Ensure `fetchOptions` is passed to ALL betterFetch calls in provider implementations.

**Testing:** Create integration tests that verify all requests use the configured options.

---

### 1.3 Provider-Specific Headers

**Issue:** Some providers require specific headers (e.g., User-Agent for GitHub).

```typescript
// GitHub requires User-Agent
const { data } = await betterFetch('https://api.github.com/user', {
  headers: {
    'User-Agent': 'better-auth',
    authorization: `Bearer ${token.accessToken}`,
  },
  ...fetchOptions, // Could override User-Agent!
});
```

**Problem:** User's `fetchOptions.headers` might override required headers.

**Solutions:**

**Option A:** Provider-specific headers take precedence
```typescript
const { data } = await betterFetch('https://api.github.com/user', {
  ...fetchOptions, // Merge first
  headers: {
    ...fetchOptions?.headers, // User headers
    'User-Agent': 'better-auth', // Override
    authorization: `Bearer ${token.accessToken}`, // Override
  },
});
```

**Option B:** Deep merge with provider headers taking precedence
```typescript
const { data } = await betterFetch('https://api.github.com/user', {
  ...fetchOptions,
  headers: {
    ...fetchOptions?.headers,
    // Provider-required headers override user headers
    'User-Agent': 'better-auth',
    authorization: `Bearer ${token.accessToken}`,
  },
});
```

**Recommendation:** Option B - Explicit and safe

---

### 1.4 OIDC Providers

**Issue:** OIDC providers make additional requests for discovery documents and JWKS.

```typescript
// Discovery
const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
const { data: discovery } = await betterFetch(discoveryUrl);

// JWKS
const { data: jwks } = await betterFetch(discovery.jwks_uri);
```

**Solution:** Pass `fetchOptions` to ALL OIDC-related functions.

**Files to check:**
- `/packages/core/src/oauth2/verify.ts`
- Any OIDC-specific plugins

---

## 2. Security Considerations

### 2.1 Proxy Credential Exposure

**Issue:** Proxy credentials in configuration could be logged or exposed.

```typescript
// Dangerous if logged
betterAuth({
  fetchOptions: {
    dispatcher: new ProxyAgent('http://user:password@proxy.company.com:8080')
  }
})
```

**Mitigations:**

1. **Documentation warning:**
```markdown
⚠️ **Security Warning**: Never log or expose your fetchOptions configuration.
Proxy credentials should be stored in environment variables.
```

2. **Example in docs:**
```typescript
// ✅ Good - credentials in env vars
const proxyUrl = process.env.PROXY_URL; // http://user:password@proxy

betterAuth({
  fetchOptions: {
    dispatcher: new ProxyAgent(proxyUrl)
  }
})
```

3. **Consider redaction in error messages:**
```typescript
// In error handler
const sanitizedUrl = url.replace(/:\/\/[^@]+@/, '://***@');
console.error(`Failed to fetch from ${sanitizedUrl}`);
```

---

### 2.2 SSRF (Server-Side Request Forgery)

**Issue:** Malicious `customFetchImpl` could make requests to internal services.

```typescript
// Malicious
betterAuth({
  fetchOptions: {
    customFetchImpl: async (url, options) => {
      // Attacker redirects to internal service
      return fetch('http://internal-db:5432', options);
    }
  }
})
```

**Mitigations:**

1. **Documentation:**
```markdown
⚠️ **Security Warning**: Only use trusted fetch implementations.
Malicious fetch implementations can make requests to internal services.
```

2. **Type safety:** TypeScript will catch most issues
```typescript
customFetchImpl?: typeof fetch; // Must match fetch signature
```

3. **Runtime validation (optional):** Could validate that requests go to expected OAuth endpoints
```typescript
// Pseudo-code
if (fetchOptions?.customFetchImpl) {
  // Wrap to add URL validation
  const originalFetch = fetchOptions.customFetchImpl;
  fetchOptions.customFetchImpl = async (url, options) => {
    if (!isAllowedOAuthUrl(url)) {
      throw new Error('Fetch URL not allowed');
    }
    return originalFetch(url, options);
  };
}
```

**Recommendation:** Documentation warning is sufficient. Runtime validation adds complexity.

---

### 2.3 Request Interception

**Issue:** `onRequest` hook could modify sensitive data.

```typescript
betterAuth({
  fetchOptions: {
    onRequest: async (request) => {
      // Could leak sensitive data
      console.log('Request body:', await request.clone().text());
      
      // Could modify request maliciously
      request.headers.set('authorization', 'Bearer malicious_token');
    }
  }
})
```

**Mitigations:**

1. **Documentation:**
```markdown
⚠️ **Security Note**: The onRequest hook receives the request before it's sent.
Avoid logging sensitive data like authorization headers or request bodies.
```

2. **Make hooks read-only (optional):**
```typescript
onRequest?: (request: Readonly<Request>) => void | Promise<void>;
```

**Recommendation:** Documentation warning. Developers have full control in their server environment.

---

## 3. Performance Considerations

### 3.1 Hook Overhead

**Issue:** Calling hooks on every request adds overhead.

```typescript
// Called for every OAuth request
fetchOptions: {
  onRequest: async (req) => {
    await logToDatabase(req); // Slow!
  }
}
```

**Mitigations:**

1. **Documentation:**
```markdown
⚠️ **Performance Note**: Hooks are called for every OAuth request.
Avoid slow operations (database writes, external API calls) in hooks.
Use async operations sparingly.
```

2. **Example:**
```typescript
// ❌ Slow
fetchOptions: {
  onRequest: async (req) => {
    await db.logs.insert({ url: req.url, timestamp: Date.now() });
  }
}

// ✅ Better
fetchOptions: {
  onRequest: (req) => {
    // Fast, non-blocking
    console.log('Request:', req.url);
  }
}

// ✅ Best for slow operations
fetchOptions: {
  onRequest: (req) => {
    // Fire and forget (if you need slow operations)
    void logRequestAsync(req);
  }
}
```

---

### 3.2 fetchOptions Cloning

**Issue:** Spreading fetchOptions on every request creates new objects.

```typescript
// Called many times
await betterFetch(url, {
  method: 'POST',
  headers: {...},
  ...fetchOptions, // Creates new object
});
```

**Impact:** Minimal - object spreading is fast in modern JS engines.

**Measurement:**
```javascript
// Benchmark
const opts = { dispatcher: proxyAgent, timeout: 5000 };
console.time('spread');
for (let i = 0; i < 1000000; i++) {
  const merged = { method: 'POST', ...opts };
}
console.timeEnd('spread'); // ~10ms for 1M iterations
```

**Conclusion:** Not a concern.

---

### 3.3 Proxy Connection Pooling

**Issue:** Each OAuth request might create new proxy connections.

```typescript
// Creates new agent on every call?
betterAuth({
  fetchOptions: {
    dispatcher: new ProxyAgent(proxyUrl)
  }
})
```

**Solution:** ProxyAgent is created once (in config), reused for all requests. ✅

**Best practice example:**
```typescript
// Agent is created once, reused
const proxyAgent = new ProxyAgent(process.env.PROXY_URL!, {
  connections: 128, // Connection pool size
  keepAlive: true,
  keepAliveTimeout: 60000,
});

betterAuth({
  fetchOptions: {
    dispatcher: proxyAgent // Reused
  }
})
```

---

## 4. Error Handling

### 4.1 Proxy Connection Failures

**Issue:** Proxy might be unavailable or misconfigured.

```typescript
// Proxy fails
await betterFetch(tokenEndpoint, {
  dispatcher: new ProxyAgent('http://down-proxy:8080')
});
// Throws: ECONNREFUSED
```

**User experience:**
- OAuth flow fails
- User sees error page
- Not clear that proxy is the issue

**Solutions:**

**Option A:** Catch and re-throw with better error message
```typescript
try {
  const { data, error } = await betterFetch(tokenEndpoint, {
    ...requestOptions,
    ...fetchOptions,
  });
  if (error) throw error;
  return data;
} catch (err) {
  if (err.code === 'ECONNREFUSED' && fetchOptions?.dispatcher) {
    throw new Error(
      'Failed to connect to OAuth provider. ' +
      'If using a proxy, verify proxy configuration.'
    );
  }
  throw err;
}
```

**Option B:** Let error propagate, document troubleshooting
```markdown
## Troubleshooting

### "ECONNREFUSED" with proxy configuration

If you see connection errors after configuring fetchOptions:
1. Verify proxy URL is correct
2. Check proxy is running
3. Verify proxy allows HTTPS connections
4. Test proxy with curl: `curl -x http://proxy:8080 https://github.com`
```

**Recommendation:** Option B - simpler, gives developers full error context.

---

### 4.2 Hook Errors

**Issue:** User's hook throws an error.

```typescript
fetchOptions: {
  onRequest: (req) => {
    throw new Error('Hook error!');
  }
}
```

**Current behavior:** Error propagates, OAuth fails.

**Question:** Should hook errors be caught and logged, or should they fail the request?

**Options:**

**Option A:** Catch and log
```typescript
if (fetchOptions?.onRequest) {
  try {
    await fetchOptions.onRequest(request);
  } catch (err) {
    console.error('onRequest hook error:', err);
    // Continue with request
  }
}
```

**Option B:** Let it fail
```typescript
if (fetchOptions?.onRequest) {
  await fetchOptions.onRequest(request);
  // Error propagates, request fails
}
```

**Recommendation:** Option B - Fail fast. Developer should fix their hook.

---

## 5. Compatibility Issues

### 5.1 Different Fetch Implementations

**Issue:** Better Auth might run in different environments:
- Node.js with native fetch (18+)
- Node.js with node-fetch (16, 17)
- Bun (native fetch)
- Cloudflare Workers (service worker fetch)
- Vercel Edge Runtime (web-standard fetch)

**Proxy configuration varies:**

```typescript
// Node.js (native fetch with undici)
import { ProxyAgent } from 'undici';
fetchOptions: {
  dispatcher: new ProxyAgent(proxyUrl)
}

// Node.js (node-fetch)
import { HttpsProxyAgent } from 'https-proxy-agent';
fetchOptions: {
  agent: new HttpsProxyAgent(proxyUrl)
}

// Cloudflare Workers
// No proxy support via fetch options
// Must configure at worker level
```

**Solution:** Document environment-specific configuration.

**Documentation example:**
```markdown
## Environment-Specific Configuration

### Node.js 18+ (native fetch with undici)
```typescript
import { ProxyAgent } from 'undici';

betterAuth({
  fetchOptions: {
    dispatcher: new ProxyAgent(process.env.PROXY_URL)
  }
})
```

### Node.js with node-fetch
```typescript
import { HttpsProxyAgent } from 'https-proxy-agent';

betterAuth({
  fetchOptions: {
    agent: new HttpsProxyAgent(process.env.PROXY_URL)
  }
})
```

### Cloudflare Workers
Proxy configuration not supported via fetch options.
Configure proxy at worker level if needed.

### Vercel Edge Runtime
Proxy configuration not available in Edge Runtime.
Use standard Node.js runtime if proxy is required.
```

---

### 5.2 TypeScript Type Compatibility

**Issue:** `fetchOptions` type needs to be compatible with all fetch implementations.

```typescript
// Too specific
fetchOptions?: {
  dispatcher?: ProxyAgent; // Only works with undici
}

// Too loose
fetchOptions?: Record<string, any>; // No type safety

// Balanced
fetchOptions?: {
  customFetchImpl?: typeof fetch;
  // ... lifecycle hooks ...
  [key: string]: any; // Allow any additional options
}
```

**Recommendation:** Use index signature for flexibility while preserving type safety for known options.

---

## 6. Testing Challenges

### 6.1 Testing with Real Proxy

**Challenge:** Integration tests need a real proxy server.

**Solutions:**

**Option A:** Use docker-compose with squid proxy
```yaml
# docker-compose.test.yml
services:
  proxy:
    image: sameersbn/squid:3.5.27-2
    ports:
      - "3128:3128"
```

**Option B:** Mock proxy in tests
```typescript
// Test with mock
const mockAgent = {
  dispatch: vi.fn()
};

const auth = betterAuth({
  fetchOptions: {
    dispatcher: mockAgent
  }
});

// Verify dispatcher was used
expect(mockAgent.dispatch).toHaveBeenCalled();
```

**Recommendation:** Option B for unit tests, Option A for integration tests.

---

### 6.2 Testing All 34 Providers

**Challenge:** Need to verify fetchOptions works for all providers.

**Solutions:**

**Option A:** Test each provider individually (time-consuming)
```typescript
describe('fetchOptions in providers', () => {
  it('github passes fetchOptions', async () => { /* ... */ });
  it('google passes fetchOptions', async () => { /* ... */ });
  // ... 32 more tests
});
```

**Option B:** Parametrized tests
```typescript
const providers = ['github', 'google', 'facebook', /* ... all 34 */];

describe.each(providers)('fetchOptions in %s provider', (providerId) => {
  it('passes fetchOptions to validateAuthorizationCode', async () => {
    const mockFetch = vi.fn();
    const provider = getProvider(providerId);
    
    await provider.validateAuthorizationCode({
      code: 'test',
      redirectURI: 'http://localhost/callback',
      fetchOptions: { customFetchImpl: mockFetch }
    });
    
    expect(mockFetch).toHaveBeenCalled();
  });
});
```

**Recommendation:** Option B - More efficient, ensures consistency.

---

## 7. Documentation Pitfalls

### 7.1 Over-Promising Proxy Support

**Pitfall:** Claiming "corporate proxy support" without caveats.

**Issue:** Some environments don't support proxies via fetch options.

**Solution:** Be explicit about limitations.

```markdown
# Corporate Proxy Support

Better Auth supports corporate proxies in server-side environments.

## Supported Environments
- ✅ Node.js 18+ (with undici)
- ✅ Node.js 16/17 (with node-fetch)
- ✅ Bun
- ❌ Cloudflare Workers (no fetch-level proxy support)
- ❌ Vercel Edge Runtime (no proxy support)

## Configuration

For supported environments, configure fetchOptions:
[... examples ...]

## Limitations

- Edge runtimes (Cloudflare Workers, Vercel Edge) don't support fetch-level proxy configuration
- If you need proxy support, use standard Node.js runtime
- Some corporate proxies might require additional configuration (certificates, authentication)
```

---

### 7.2 Security Warnings

**Pitfall:** Not warning users about security implications.

**Solution:** Clear security section in docs.

```markdown
## Security Considerations

### Proxy Credentials
- ⚠️ Store proxy credentials in environment variables
- ⚠️ Never commit proxy URLs with credentials to version control
- ⚠️ Be careful when logging - avoid exposing credentials

### Custom Fetch Implementations
- ⚠️ Only use trusted fetch implementations
- ⚠️ Malicious implementations can access internal services
- ⚠️ Avoid using fetch implementations from untrusted sources

### Request Hooks
- ⚠️ Hooks have access to sensitive request data
- ⚠️ Avoid logging authorization headers or request bodies
- ⚠️ Be cautious when modifying requests in hooks
```

---

### 7.3 Performance Guidance

**Pitfall:** Not warning about slow operations in hooks.

**Solution:** Performance best practices section.

```markdown
## Performance Best Practices

### Avoid Slow Operations in Hooks

❌ **Avoid:**
```typescript
fetchOptions: {
  onRequest: async (req) => {
    // Slow database write
    await db.logs.insert({ url: req.url });
  }
}
```

✅ **Instead:**
```typescript
fetchOptions: {
  onRequest: (req) => {
    // Fast logging
    console.log('Request:', req.url);
  }
}
```

### Connection Pooling

For best performance, create proxy agents once and reuse:

✅ **Good:**
```typescript
const proxyAgent = new ProxyAgent(proxyUrl, {
  connections: 128,
  keepAlive: true
});

betterAuth({ fetchOptions: { dispatcher: proxyAgent } })
```

❌ **Avoid:**
```typescript
betterAuth({
  fetchOptions: {
    // Don't create new agent on each request!
    dispatcher: createNewProxyAgent()
  }
})
```
```

---

## Summary of Key Edge Cases

| Category | Issue | Solution | Priority |
|----------|-------|----------|----------|
| Providers | Custom getUserInfo | Pass fetchOptions to custom functions | High |
| Providers | Multi-step OAuth | Pass fetchOptions to all requests | High |
| Providers | Provider headers | Deep merge with provider precedence | High |
| Security | Proxy credentials | Documentation warnings | High |
| Security | SSRF risks | Documentation, type safety | Medium |
| Performance | Hook overhead | Documentation, best practices | Medium |
| Compatibility | Different runtimes | Environment-specific docs | High |
| Testing | All providers | Parametrized tests | High |
| Docs | Over-promising | Clear limitations | High |

---

## Recommendations

### Must Have
1. ✅ Deep merge headers (provider headers take precedence)
2. ✅ Pass fetchOptions through ALL OAuth requests
3. ✅ Document environment-specific configuration
4. ✅ Security warnings in documentation
5. ✅ Parametrized tests for all providers

### Should Have
1. ⚠️ Performance best practices in docs
2. ⚠️ Troubleshooting guide for proxy issues
3. ⚠️ Integration tests with real proxy

### Nice to Have
1. 💭 Better error messages for proxy failures
2. 💭 Example repository with working proxy setup
3. 💭 Video tutorial for corporate proxy setup

---

**Next Step:** Incorporate these considerations into the implementation plan.
