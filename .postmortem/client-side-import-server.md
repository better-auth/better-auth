# Postmortem: Client-Side Import of Server Package

## Issue Reference

* [PR #7532](https://github.com/better-auth/better-auth/pull/7532)
* [Issue #7529](https://github.com/better-auth/better-auth/issues/7529)
* [Incorrectly blamed PR #4360](https://github.com/better-auth/better-auth/pull/4360)

## Summary

Users are incorrectly importing the server-side `better-auth` package
directly in their client-side code, causing build and runtime errors.
This is a common user mistake that keeps resurfacing.

## Root Cause

### The Problematic Import Chain

Users create this incorrect dependency chain in their client code:

```text
loginPage (React/Vue/Solid component)
   ↓
auth-client.ts
   ↓
import { ... } from "better-auth"  ← WRONG!
```

**This is 100% a user error.**
The correct import should be:

```ts
// WRONG - Server package in client code
import { ... } from "better-auth"

// CORRECT - Client package for client code
import { createAuthClient } from "better-auth/client"
```

### Why This Happens

1. **Confusing package naming** - Users assume `better-auth` is the
   main entry point for everything
2. **Auto-import suggestions** - IDEs often suggest the wrong import
3. **Copy-paste from examples** - Users copy server examples into
   client code
4. **Lack of clear error messages** - Build errors do not clearly
   explain the import boundary violation

## The Real Problem

When users import `better-auth` in client code:

1. **Node.js modules get bundled** - Server-only dependencies like
   `node:sqlite` end up in client bundles
2. **Build failures** - Bundlers cannot resolve Node.js built-ins
3. **Runtime errors** - Even if builds succeed, code fails in browser
4. **Increased bundle size** - Unnecessary server code shipped to client

## Why PR #4360 Was Incorrectly Blamed

PR #4360 added a `typeof window === "undefined"` check to prevent
`node:sqlite` errors.
This was a **workaround**, not the cause.
The real issue is users importing server packages in client code.

## Solution

### For Users

```js
// In any client-side file (React, Vue, Solid, etc.)
// NEVER do this:
import { anything } from "better-auth"

// ALWAYS do this:
import { createAuthClient } from "better-auth/client"
import type { Session, User } from "better-auth/types"
```

### For the Library

1. **Better error messages** - Detect client environment and throw
   clear errors when server package is imported
2. **Build-time detection** - Add package.json exports that prevent
   incorrect imports
3. **Documentation** - Make the distinction crystal clear

## Changes in PR [#7532](https://github.com/better-auth/better-auth/pull/7532)

While fixing test infrastructure, the real issue was revealed:

1. **Test cleanup** - Fixed window stubbing (secondary issue)
2. **Import boundaries** - The tests exposed that server code was
   being imported in client contexts

## Lesson Learned

1. **Users will make this mistake** - The naming is confusing
2. **Workarounds hide root causes** - Adding `window` checks does not
   fix users importing the wrong package
3. **Clear boundaries needed** - Server and client packages must be
   clearly separated
4. **This is not a regression** - It is an ongoing user education issue

## Prevention

### Immediate Actions

1. **Add runtime detection**:
   ```js
   // In better-auth/index.ts
   if (typeof window !== "undefined") {
     throw new Error(
       "You are importing 'better-auth' in client code. " +
       "Use 'better-auth/client' instead."
     );
   }
   ```

2. **Update documentation** - Add prominent warnings about imports

3. **Fix auto-imports** - Configure package.json to guide IDEs

### Long-term Solutions

1. **Build-time validation** - ESLint plugin to catch wrong imports

2. **Better examples** - Clearly separate server and client code

## User Action Required

If you are seeing build errors with `node:*` modules:

1. **Check your imports** - You are importing `better-auth` in client code
2. **Fix the import** - Change to `better-auth/client`
3. **Never import server packages in client code**

This is not a bug in Better Auth - it is incorrect usage.
