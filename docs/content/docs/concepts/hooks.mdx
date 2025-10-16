---
title: Hooks
description: Better Auth Hooks let you customize BetterAuth's behavior
---

Hooks in Better Auth let you "hook into" the lifecycle and execute custom logic. They provide a way to customize Better Auth's behavior without writing a full plugin. 

<Callout>
We highly recommend using hooks if you need to make custom adjustments to an endpoint rather than making another endpoint outside of Better Auth.
</Callout>

## Before Hooks

**Before hooks** run *before* an endpoint is executed. Use them to modify requests, pre validate data, or return early.

### Example: Enforce Email Domain Restriction

This hook ensures that users can only sign up if their email ends with `@example.com`:

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";

export const auth = betterAuth({
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== "/sign-up/email") {
                return;
            }
            if (!ctx.body?.email.endsWith("@example.com")) {
                throw new APIError("BAD_REQUEST", {
                    message: "Email must end with @example.com",
                });
            }
        }),
    },
});
```

### Example: Modify Request Context

To adjust the request context before proceeding:

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

export const auth = betterAuth({
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path === "/sign-up/email") {
                return {
                    context: {
                        ...ctx,
                        body: {
                            ...ctx.body,
                            name: "John Doe",
                        },
                    }
                };
            }
        }),
    },
});
```

## After Hooks

**After hooks** run *after* an endpoint is executed. Use them to modify responses.

### Example: Send a notification to your channel when a new user is registered

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { sendMessage } from "@/lib/notification"

export const auth = betterAuth({
    hooks: {
        after: createAuthMiddleware(async (ctx) => {
            if(ctx.path.startsWith("/sign-up")){
                const newSession = ctx.context.newSession;
                if(newSession){
                    sendMessage({
                        type: "user-register",
                        name: newSession.user.name,
                    })
                }
            }
        }),
    },
});
```

## Ctx

When you call `createAuthMiddleware` a `ctx` object is passed that provides a lot of useful properties. Including:

- **Path:** `ctx.path` to get the current endpoint path.
- **Body:** `ctx.body` for parsed request body (available for POST requests).
- **Headers:** `ctx.headers` to access request headers.
- **Request:** `ctx.request` to access the request object (may not exist in server-only endpoints).
- **Query Parameters:** `ctx.query` to access query parameters.
- **Context**: `ctx.context` auth related context, useful for accessing new session, auth cookies configuration, password hashing, config...

and more.

### Request Response

This utilities allows you to get request information and to send response from a hook. 

#### JSON Responses

Use `ctx.json` to send JSON responses:

```ts
const hook = createAuthMiddleware(async (ctx) => {
    return ctx.json({
        message: "Hello World",
    });
});
```

#### Redirects

Use `ctx.redirect` to redirect users:

```ts
import { createAuthMiddleware } from "better-auth/api";

const hook = createAuthMiddleware(async (ctx) => {
    throw ctx.redirect("/sign-up/name");
});
```

#### Cookies

- Set cookies: `ctx.setCookies` or `ctx.setSignedCookie`.
- Get cookies: `ctx.getCookies` or `ctx.getSignedCookie`.

Example:

```ts
import { createAuthMiddleware } from "better-auth/api";

const hook = createAuthMiddleware(async (ctx) => {
    ctx.setCookies("my-cookie", "value");
    await ctx.setSignedCookie("my-signed-cookie", "value", ctx.context.secret, {
        maxAge: 1000,
    });

    const cookie = ctx.getCookies("my-cookie");
    const signedCookie = await ctx.getSignedCookie("my-signed-cookie");
});
```

#### Errors

Throw errors with `APIError` for a specific status code and message:

```ts
import { createAuthMiddleware, APIError } from "better-auth/api";

const hook = createAuthMiddleware(async (ctx) => {
    throw new APIError("BAD_REQUEST", {
        message: "Invalid request",
    });
});
```



### Context

The `ctx` object contains another `context` object inside that's meant to hold contexts related to auth. Including a newly created session on after hook, cookies configuration, password hasher and so on. 

#### New Session

The newly created session after an endpoint is run. This only exist in after hook.

```ts title="auth.ts"
createAuthMiddleware(async (ctx) => {
    const newSession = ctx.context.newSession
});
```

#### Returned

The returned value from the hook is passed to the next hook in the chain.

```ts title="auth.ts"
createAuthMiddleware(async (ctx) => {
    const returned = ctx.context.returned; //this could be a successful response or an APIError
});
```

#### Response Headers

The response headers added by endpoints and hooks that run before this hook.

```ts title="auth.ts"
createAuthMiddleware(async (ctx) => {
    const responseHeaders = ctx.context.responseHeaders;
});
```

#### Predefined Auth Cookies

Access BetterAuth’s predefined cookie properties:

```ts title="auth.ts"
createAuthMiddleware(async (ctx) => {
    const cookieName = ctx.context.authCookies.sessionToken.name;
});
```

#### Secret

You can access the `secret` for your auth instance on `ctx.context.secret`

#### Password

The password object provider `hash` and `verify`

- `ctx.context.password.hash`: let's you hash a given password.
- `ctx.context.password.verify`: let's you verify given `password` and a `hash`.

#### Adapter

Adapter exposes the adapter methods used by Better Auth. Including `findOne`, `findMany`, `create`, `delete`, `update` and `updateMany`. You generally should use your actually `db` instance from your orm rather than this adapter.


#### Internal Adapter

These are calls to your db that perform specific actions. `createUser`, `createSession`, `updateSession`...

This may be useful to use instead of using your db directly to get access to `databaseHooks`, proper `secondaryStorage` support and so on. If you're make a query similar to what exist in this internal adapter actions it's worth a look.

#### generateId

You can use `ctx.context.generateId` to generate Id for various reasons.

## Reusable Hooks

If you need to reuse a hook across multiple endpoints, consider creating a plugin. Learn more in the [Plugins Documentation](/docs/concepts/plugins).

