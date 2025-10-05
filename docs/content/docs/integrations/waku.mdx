---
title: Waku Integration
description: Integrate Better Auth with Waku.
---

Better Auth can be easily integrated with Waku. Before you start, make sure you have a Better Auth instance configured. If you haven't done that yet, check out the [installation](/docs/installation).

## Create auth instance

Create a file named `auth.ts` in your application. Import Better Auth and create your instance.

<Callout type="warn">
Make sure to export the auth instance with the variable name `auth` or as a `default` export.
</Callout>

```ts title="src/auth.ts"
import { betterAuth } from "better-auth"

export const auth = betterAuth({
    database: {
        provider: "postgres", //change this to your database provider
        url: process.env.DATABASE_URL, // path to your database or connection string
    }
})
```

## Create API Route

We need to mount the handler to a API route. Create a directory for Waku's file system router at `src/pages/api/auth`. Create a catch-all route file `[...route].ts` inside the `src/pages/api/auth` directory. And add the following code:

```ts title="src/pages/api/auth/[...route].ts"
import { auth } from "../../../auth" // Adjust the path as necessary

export const GET = async (request: Request): Promise<Response> => {
  return auth.handler(request)
}

export const POST = async (request: Request): Promise<Response> => {
  return auth.handler(request)
}
```

<Callout type="info">
 You can change the path on your better-auth configuration but it's recommended to keep it as `src/pages/api/auth/[...route].ts`
</Callout>

## Create a client

Create a client instance. Here we are creating `auth-client.ts` file inside the `lib/` directory.

```ts title="src/lib/auth-client.ts"
import { createAuthClient } from "better-auth/react" // make sure to import from better-auth/react

export const authClient = createAuthClient({
    //you can pass client configuration here
})

export type Session = typeof authClient.$Infer.Session // you can infer typescript types from the authClient
```

Once you have created the client, you can use it to sign up, sign in, and perform other actions.
Some of the actions are reactive. The client uses [nano-store](https://github.com/nanostores/nanostores) to store the state and re-render the components when the state changes.

The client also uses [better-fetch](https://github.com/bekacru/better-fetch) to make the requests. You can pass the fetch configuration to the client.

## RSC and Server actions

The `api` object exported from the auth instance contains all the actions that you can perform on the server. Every endpoint made inside Better Auth is a invocable as a function. Including plugins endpoints.

**Example: Getting Session on a server action**

```tsx title="server.ts"
"use server" // Waku currently only supports file-level "use server"

import { auth } from "./auth"
import { getContext } from "waku/middleware/context"

export const someAuthenticatedAction = async () => {
  "use server"
  const session = await auth.api.getSession({
    headers: new Headers(getContext().req.headers),
  })
};
```

**Example: Getting Session on a RSC**


```tsx
import { auth } from "../auth"
import { getContext } from "waku/middleware/context"

export async function ServerComponent() {
    const session = await auth.api.getSession({
        headers: new Headers(getContext().req.headers),
    })
    if(!session) {
        return <div>Not authenticated</div>
    }
    return (
        <div>
            <h1>Welcome {session.user.name}</h1>
        </div>
    )
}
```

<Callout type="warn">RSCs that run after the response has started streaming cannot set cookies. The [cookie cache](/docs/concepts/session-management#cookie-cache) will not be refreshed until the server is interacted with from the client via Server Actions or Route Handlers.</Callout>

### Server Action Cookies

When you call a function that needs to set cookies, like `signInEmail` or `signUpEmail` in a server action, cookies won’t be set.

We can create a plugin that works together with our middleware to set cookies.

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { wakuCookies } from "better-auth/waku";
import { getContextData } from "waku/middleware/context";

export const auth = betterAuth({
    //...your config
    plugins: [wakuCookies()] // make sure this is the last plugin in the array // [!code highlight]
})

function wakuCookies() {
  return {
    id: "waku-cookies",
    hooks: {
      after: [
        {
          matcher(ctx) {
            return true;
          },
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.responseHeaders;
            if ("_flag" in ctx && ctx._flag === "router") {
              return;
            }
            if (returned instanceof Headers) {
              const setCookieHeader = returned?.get("set-cookie");
              if (!setCookieHeader) return;
              const contextData = getContextData();
              contextData.betterAuthSetCookie = setCookieHeader;
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
```

See below for the middleware to create to add the `contextData.betterAuthSetCookie` cookies to the response.
Now, when you call functions that set cookies, they will be automatically set.

```ts
"use server";
import { auth } from "../auth"

const signIn = async () => {
    await auth.api.signInEmail({
        body: {
            email: "user@email.com",
            password: "password",
        }
    })
}
```

### Middleware

In Waku middleware, it's recommended to only check for the existence of a session cookie to handle redirection. This avoids blocking requests by making API or database calls.

You can use the `getSessionCookie` helper from Better Auth for this purpose:

<Callout type="warn">
The <code>getSessionCookie()</code> function does not automatically reference the auth config specified in <code>auth.ts</code>. Therefore, if you customized the cookie name or prefix, you need to ensure that the configuration in <code>getSessionCookie()</code> matches the config defined in your <code>auth.ts</code>.
</Callout>

```ts title="src/middleware/auth.ts"
import type { Middleware } from "waku/config"
import { getSession } from "../auth"
import { getSessionCookie } from "better-auth/cookies"

const authMiddleware: Middleware = () => {
    return async (ctx, next) => {
        const sessionCookie = getSessionCookie(
            new Request(ctx.req.url, {
                body: ctx.req.body,
                headers: ctx.req.headers,
                method: ctx.req.method,
            })
        )
        // THIS IS NOT SECURE!
        // This is the recommended approach to optimistically redirect users
        // We recommend handling auth checks in each page/route
        if (!sessionCookie && ctx.req.url.pathname !== "/") {
            if (!ctx.req.url.pathname.endsWith(".txt")) {
                // Currently RSC requests end in .txt and don't handle redirect responses
                // The redirect needs to be encoded in the React flight stream somehow
                // There is some functionality in Waku to do this from a server component
                // but not from middleware.
                ctx.res.status = 302;
                ctx.res.headers = {
                  Location: new URL("/", ctx.req.url).toString(),
                };
            }
        }

        // TODO possible to inspect ctx.req.url and not do this on every request
        // Or skip starting the promise here and just invoke from server components and functions
        getSession()
        await next()
        if (ctx.data.betterAuthSetCookie) {
            ctx.res.headers ||= {}
            let origSetCookie = ctx.res.headers["set-cookie"] || ([] as string[])
            if (typeof origSetCookie === "string") {
                origSetCookie = [origSetCookie]
            }
            ctx.res.headers["set-cookie"] = [
                ...origSetCookie,
                ctx.data.betterAuthSetCookie as string,
            ]
        }
    }
};

export default authMiddleware;
```

<Callout type="warn">
	**Security Warning:** The `getSessionCookie` function only checks for the
	existence of a session cookie; it does **not** validate it. Relying solely
	on this check for security is dangerous, as anyone can manually create a
	cookie to bypass it. You must always validate the session on your server for
	any protected actions or pages.
</Callout>

<Callout type="info">
If you have a custom cookie name or prefix, you can pass it to the `getSessionCookie` function.
```ts
const sessionCookie = getSessionCookie(request, {
    cookieName: "my_session_cookie",
    cookiePrefix: "my_prefix"
})
```
</Callout>

Alternatively, you can use the `getCookieCache` helper to get the session object from the cookie cache.

```ts
import { getCookieCache } from "better-auth/cookies"

const authMiddleware: Middleware = () => {
    return async (ctx, next) => {
        const session = await getCookieCache(ctx.req)
        if (!session && ctx.req.url.pathname !== "/") {
            if (!ctx.req.url.pathname.endsWith(".txt")) {
                ctx.res.status = 302
                ctx.res.headers = {
                    Location: new URL("/", ctx.req.url).toString(),
                }
            }
        }
    }
    await next();
  }
}

export default authMiddleware;
```

Note that your middleware will need to be added to a waku.config.ts file (create this file if it doesn't already exist in your project):

```ts title="waku.config.ts"
import { defineConfig } from "waku/config";

export default defineConfig({
  middleware: [
    "waku/middleware/context",
    "waku/middleware/dev-server",
    "./src/middleware/auth.ts",
    "waku/middleware/handler",
  ],
});
```

### How to handle auth checks in each page/route

In this example, we are using the `auth.api.getSession` function within a server component to get the session object,
then we are checking if the session is valid. If it's not, we are redirecting the user to the sign-in page.
Waku has `getContext` to get the request headers and `getContextData()` to store data per request. We can use this
to avoid fetching the session more than once per request.

```ts title="auth.ts"
import { getContext, getContextData } from "waku/middleware/context";

// Code from above to create the server auth config
// export const auth = ...

export function getSession(): Promise<Session | null> {
  const contextData = getContextData();
  const ctx = getContext();
  const existingSessionPromise = contextData.sessionPromise as
    | Promise<Session | null>
    | undefined;
  if (existingSessionPromise) {
    return existingSessionPromise;
  }
  const sessionPromise = auth.api.getSession({
    headers: new Headers(ctx.req.headers),
  });
  contextData.sessionPromise = sessionPromise;
  return sessionPromise;
}
```


```tsx title="src/pages/dashboard.tsx"
import { getSession } from "../auth";
import { unstable_redirect as redirect } from 'waku/router/server';

export default async function DashboardPage() {
    const session = await getSession()

    if (!session) {
        redirect("/sign-in")
    }

    return (
        <div>
            <h1>Welcome {session.user.name}</h1>
        </div>
    )
}
```

### Example usage

#### Sign Up

```ts title="src/components/signup.tsx"
"use client"

import { useState } from "react"
import { authClient } from "../lib/auth-client"

export default function SignUp() {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")

  const signUp = async () => {
    await authClient.signUp.email(
      {
        email,
        password,
        name,
      },
      {
        onRequest: (ctx) => {
          // show loading state
        },
        onSuccess: (ctx) => {
          // redirect to home
        },
        onError: (ctx) => {
          alert(ctx.error)
        },
      },
    )
  }

  return (
    <div>
      <h2>
        Sign Up
      </h2>
      <form
        onSubmit={signUp}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button
          type="submit"
        >
          Sign Up
        </button>
      </form>
    </div>
  )
}

```

#### Sign In

```ts title="src/components/signin.tsx"
"use client"

import { useState } from "react"
import { authClient } from "../lib/auth-client"

export default function SignIn() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const signIn = async () => {
    await authClient.signIn.email(
      {
        email,
        password,
      },
      {
        onRequest: (ctx) => {
          // show loading state
        },
        onSuccess: (ctx) => {
          // redirect to home
        },
        onError: (ctx) => {
          alert(ctx.error)
        },
      },
    )
  }

  return (
    <div>
      <h2>
        Sign In
      </h2>
      <form onSubmit={signIn}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
        >
          Sign In
        </button>
      </form>
    </div>
  )
}
```
