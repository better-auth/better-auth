---
title: Rate Limit
description: How to limit the number of requests a user can make to the server in a given time period.
---

Better Auth includes a built-in rate limiter to help manage traffic and prevent abuse. By default, in production mode, the rate limiter is set to:

- Window: 60 seconds
- Max Requests: 100 requests

<Callout type="warning">
Server-side requests made using `auth.api` aren't affected by rate limiting. Rate limits only apply to client-initiated requests.
</Callout>

You can easily customize these settings by passing the rateLimit object to the betterAuth function.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    rateLimit: {
        window: 10, // time window in seconds
        max: 100, // max requests in the window
    },
})
```

Rate limiting is disabled in development mode by default. In order to enable it, set `enabled` to `true`:

```ts title="auth.ts"
export const auth = betterAuth({
    rateLimit: {
        enabled: true,
        //...other options
    },
})
```

In addition to the default settings, Better Auth provides custom rules for specific paths. For example:
- `/sign-in/email`: Is limited to 3 requests within 10 seconds.

In addition, plugins also define custom rules for specific paths. For example, `twoFactor` plugin has custom rules:
- `/two-factor/verify`: Is limited to 3 requests within 10 seconds.

These custom rules ensure that sensitive operations are protected with stricter limits.

## Configuring Rate Limit

### Connecting IP Address

Rate limiting uses the connecting IP address to track the number of requests made by a user. The
default header checked is `x-forwarded-for`, which is commonly used in production environments. If
you are using a different header to track the user's IP address, you'll need to specify it.

```ts title="auth.ts" 
export const auth = betterAuth({
    //...other options
    advanced: {
        ipAddress: {
          ipAddressHeaders: ["cf-connecting-ip"], // Cloudflare specific header example
      },
    },
    rateLimit: {
        enabled: true,
        window: 60, // time window in seconds
        max: 100, // max requests in the window
    },
})
```

### Rate Limit Window

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    //...other options
    rateLimit: {
        window: 60, // time window in seconds
        max: 100, // max requests in the window
    },
})
```

You can also pass custom rules for specific paths.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    //...other options
    rateLimit: {
        window: 60, // time window in seconds
        max: 100, // max requests in the window
        customRules: {
            "/sign-in/email": {
                window: 10,
                max: 3,
            },
            "/two-factor/*": async (request)=> {
                // custom function to return rate limit window and max
                return {
                    window: 10,
                    max: 3,
                }
            }
        },
    },
})
```

If you like to disable rate limiting for a specific path, you can set it to `false` or return `false` from the custom rule function.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    //...other options
    rateLimit: {
        customRules: {
            "/get-session": false,
        },
    },
})
```

### Storage

By default, rate limit data is stored in memory, which may not be suitable for many use cases, particularly in serverless environments. To address this, you can use a database, secondary storage, or custom storage for storing rate limit data.

**Using Database**

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    //...other options
    rateLimit: {
        storage: "database",
        modelName: "rateLimit", //optional by default "rateLimit" is used
    },
})
```

Make sure to run `migrate` to create the rate limit table in your database.

```bash
npx @better-auth/cli migrate
```

**Using Secondary Storage**

If a [Secondary Storage](/docs/concepts/database#secondary-storage) has been configured you can use that to store rate limit data.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    //...other options
    rateLimit: {
		storage: "secondary-storage"
    },
})
```

**Custom Storage**

If none of the above solutions suits your use case you can implement a `customStorage`.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    //...other options
    rateLimit: {
        customStorage: {
            get: async (key) => {
                // get rate limit data
            },
            set: async (key, value) => {
                // set rate limit data
            },
        },
    },
})
```

## Handling Rate Limit Errors

When a request exceeds the rate limit, Better Auth returns the following header:

- `X-Retry-After`: The number of seconds until the user can make another request.

To handle rate limit errors on the client side, you can manage them either globally or on a per-request basis. Since Better Auth clients wrap over Better Fetch, you can pass `fetchOptions` to handle rate limit errors

**Global Handling**

```ts title="auth-client.ts"
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
    fetchOptions: {
        onError: async (context) => {
            const { response } = context;
            if (response.status === 429) {
                const retryAfter = response.headers.get("X-Retry-After");
                console.log(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
            }
        },
    }
})
```


**Per Request Handling**

```ts title="auth-client.ts"
import { authClient } from "./auth-client";

await authClient.signIn.email({
    fetchOptions: {
        onError: async (context) => {
            const { response } = context;
            if (response.status === 429) {
                const retryAfter = response.headers.get("X-Retry-After");
                console.log(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
            }
        },
    }
})
```

### Schema

If you are using a database to store rate limit data you need this schema:

Table Name: `rateLimit`

<DatabaseTable
    fields={[
        { 
        name: "id", 
        type: "string", 
        description: "Database ID",
        isPrimaryKey: true
        },
        { 
        name: "key", 
        type: "string", 
        description: "Unique identifier for each rate limit key",
        },
        { 
        name: "count", 
        type: "integer", 
        description: "Time window in seconds" 
        },
        { 
        name: "lastRequest", 
        type: "bigint", 
        description: "Max requests in the window" 
        }]}
    />
