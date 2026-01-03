---
title: Astro Integration
description: Integrate Better Auth with Astro.
---

Better Auth comes with first class support for Astro. This guide will show you how to integrate Better Auth with Astro.

Before you start, make sure you have a Better Auth instance configured. If you haven't done that yet, check out the [installation](/docs/installation).

### Mount the handler

To enable Better Auth to handle requests, we need to mount the handler to a catch all API route. Create a file inside `/pages/api/auth` called `[...all].ts` and add the following code:

```ts title="pages/api/auth/[...all].ts"
import { auth } from "~/auth";
import type { APIRoute } from "astro";

export const ALL: APIRoute = async (ctx) => {
	// If you want to use rate limiting, make sure to set the 'x-forwarded-for' header to the request headers from the context
	// ctx.request.headers.set("x-forwarded-for", ctx.clientAddress);
	return auth.handler(ctx.request);
};
```

<Callout>
    You can change the path on your better-auth configuration but it's recommended to keep it as `/api/auth/[...all]`
</Callout>

## Create a client

Astro supports multiple frontend frameworks, so you can easily import your client based on the framework you're using.

If you're not using a frontend framework, you can still import the vanilla client.


<Tabs items={[ "vanilla", "react", "vue", "svelte", "solid",
 ]} defaultValue="react">
    <Tab value="vanilla">
            ```ts  title="lib/auth-client.ts"
            import { createAuthClient } from "better-auth/client"
            export const authClient =  createAuthClient()
            ```
    </Tab>
    <Tab value="react" title="lib/auth-client.ts">
            ```ts  title="lib/auth-client.ts"
            import { createAuthClient } from "better-auth/react"
            export const authClient =  createAuthClient()
            ```
    </Tab>
    <Tab value="vue" title="lib/auth-client.ts">
            ```ts  title="lib/auth-client.ts"
            import { createAuthClient } from "better-auth/vue"
            export const authClient =  createAuthClient()
            ```
    </Tab>
    <Tab value="svelte" title="lib/auth-client.ts">
            ```ts  title="lib/auth-client.ts"
            import { createAuthClient } from "better-auth/svelte"
            export const authClient =  createAuthClient()
            ```
    </Tab>
    <Tab value="solid" title="lib/auth-client.ts">
            ```ts title="lib/auth-client.ts"
            import { createAuthClient } from "better-auth/solid"
            export const authClient =  createAuthClient()
            ```
    </Tab>
</Tabs>

## Auth Middleware

### Astro Locals types

To have types for your Astro locals, you need to set it inside the `env.d.ts` file.

```ts title="env.d.ts"

/// <reference path="../.astro/types.d.ts" />

declare namespace App {
    // Note: 'import {} from ""' syntax does not work in .d.ts files.
    interface Locals {
        user: import("better-auth").User | null;
        session: import("better-auth").Session | null;
    }
}
```

### Middleware

To protect your routes, you can check if the user is authenticated using the `getSession` method in middleware and set the user and session data using the Astro locals with the types we set before. Start by creating a `middleware.ts` file in the root of your project and follow the example below:

```ts title="middleware.ts"
import { auth } from "@/auth";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
    const isAuthed = await auth.api
        .getSession({
            headers: context.request.headers,
        })

    if (isAuthed) {
        context.locals.user = isAuthed.user;
        context.locals.session = isAuthed.session;
    } else {
        context.locals.user = null;
        context.locals.session = null;
    }

    return next();
});
```

### Getting session on the server inside `.astro` file

You can use `Astro.locals` to check if the user has session and get the user data from the server side. Here is an example of how you can get the session inside an `.astro` file:

```astro
---
import { UserCard } from "@/components/user-card";

const session = () => {
    if (Astro.locals.session) {
        return Astro.locals.session;
    } else {
        // Redirect to login page if the user is not authenticated
        return Astro.redirect("/login");
    }
}

---

<UserCard initialSession={session} />
```
