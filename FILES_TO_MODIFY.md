# Complete List of Files to Modify

## Summary

**Total files with betterFetch: 49 files** (excluding tests)

Categorized by context access:

## Category A: Has Context (ctx) - Direct Replacement ✅

These files are endpoints/routes with `ctx` parameter.  
**Change:** `betterFetch(...)` → `ctx.context.fetch(...)`

### Captcha Verify Handlers (4 files)
- `packages/better-auth/src/plugins/captcha/verify-handlers/cloudflare-turnstile.ts`
- `packages/better-auth/src/plugins/captcha/verify-handlers/captchafox.ts`
- `packages/better-auth/src/plugins/captcha/verify-handlers/h-captcha.ts`
- `packages/better-auth/src/plugins/captcha/verify-handlers/google-recaptcha.ts`

### Plugin Routes (2 files)
- `packages/better-auth/src/plugins/generic-oauth/routes.ts`
- `packages/better-auth/src/plugins/haveibeenpwned/index.ts`

### SSO Routes (1 file)
- `packages/sso/src/routes/sso.ts`

**Subtotal: 7 files**

---

## Category B: No Direct ctx - Use Async Storage 🔧

These don't receive `ctx` as parameter but can access it via async local storage.  
**Change:** Use `getCurrentAuthContext()` to access `ctx.context.fetch`

### OAuth2 Core Functions (4 files)
- `packages/core/src/oauth2/validate-authorization-code.ts`
- `packages/core/src/oauth2/refresh-access-token.ts`
- `packages/core/src/oauth2/verify.ts`
- `packages/core/src/oauth2/client-credentials-token.ts`

### Social Providers (28 files - all from packages/core/src/social-providers/)
- `apple.ts`
- `atlassian.ts`
- `cognito.ts`
- `discord.ts`
- `dropbox.ts`
- `facebook.ts`
- `figma.ts`
- `github.ts`
- `gitlab.ts`
- `google.ts`
- `huggingface.ts`
- `kakao.ts`
- `kick.ts`
- `linear.ts`
- `line.ts`
- `linkedin.ts`
- `microsoft-entra-id.ts`
- `naver.ts`
- `notion.ts`
- `paypal.ts`
- `polar.ts`
- `reddit.ts`
- `roblox.ts`
- `salesforce.ts`
- `slack.ts`
- `spotify.ts`
- `tiktok.ts`
- `twitter.ts`
- `vercel.ts`
- `vk.ts`
- `zoom.ts`

### SSO Discovery (1 file)
- `packages/sso/src/oidc/discovery.ts`

### Generic OAuth Plugin (1 file)
- `packages/better-auth/src/plugins/generic-oauth/index.ts`

**Subtotal: 35 files**

---

## Category C: Independent/Optional 🤔

These might not need changes or can remain using betterFetch.

### Telemetry (1 file)
- `packages/telemetry/src/index.ts`

**Decision:** Keep using betterFetch directly (reports to Better Auth servers, not user's OAuth providers)

**Subtotal: 1 file (no change needed)**

---

## New/Modified Files

### Type Definitions (2 files)
- `packages/core/src/types/init-options.ts` - Add `fetchOptions`
- `packages/core/src/types/context.ts` - Add `fetch` to AuthContext

### Context Creation (1 file)
- `packages/better-auth/src/context/create-context.ts` - Create fetch instance

**Subtotal: 3 files**

---

## Grand Total

- Files with betterFetch to modify: **42 files** (7 + 35)
- Files with betterFetch to keep: **1 file** (telemetry)
- New/modified infrastructure files: **3 files**

**Total files touched: 45 files**

---

## Implementation Strategy

### Phase 1: Foundation (3 files)
1. Add `fetchOptions` type
2. Add `fetch` to context
3. Create fetch instance

### Phase 2: Category A - Endpoints (7 files)
Direct replacement, easiest to implement and test.

### Phase 3: OAuth2 Core (4 files)
Foundation for providers, must be done before providers.

### Phase 4: Social Providers (28 files)
Batch implementation, can be parallelized.

### Phase 5: Remaining (3 files)
- SSO discovery
- Generic OAuth plugin
- Any stragglers

### Phase 6: Testing & Docs
- Integration tests
- Documentation
- Examples

---

## Can All Files Access Context? Final Answer ✅

**YES!** All files can access context via `getCurrentAuthContext()` from async local storage.

Files without direct `ctx` parameter:
1. **OAuth2 Core (4 files)** - Pure utility functions
2. **Social Providers (28 files)** - Factory functions
3. **SSO Discovery (1 file)** - Helper function
4. **Generic OAuth Plugin factories (1 file)** - Factory function

**Total: 35 files without direct ctx parameter**

**Solution:** These use `getCurrentAuthContext()` to access `ctx.context.fetch`.

No need to modify function signatures or pass parameters! 🎉

---

## How It Flows

```
User Config (fetchOptions)
  ↓
createAuthContext() creates fetch instance
  ↓
Stored in ctx.context.fetch + AsyncLocalStorage
  ↓
Any code anywhere:
  - Has ctx? → ctx.context.fetch
  - No ctx? → (await getCurrentAuthContext()).context.fetch
```

**Every file can access the configured fetch instance!** ✅

No parameter passing needed - async local storage makes it available everywhere.
