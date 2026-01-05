---
title: Nuxt Integration
description: Integrate Better Auth with Nuxt.
---

Before you start, make sure you have a Better Auth instance configured. If you haven't done that yet, check out the [installation](/docs/installation).

### Create API Route

We need to mount the handler to an API route. Create a file inside `/server/api/auth` called `[...all].ts` and add the following code:

```ts title="server/api/auth/[...all].ts"
import { auth } from "~/lib/auth"; // import your auth config

export default defineEventHandler((event) => {
	return auth.handler(toWebRequest(event));
});
```
<Callout type="info">
 You can change the path on your better-auth configuration but it's recommended to keep it as `/api/auth/[...all]`
</Callout>

### Migrate the database

Run the following command to create the necessary tables in your database:

```bash
npx @better-auth/cli migrate
```

## Create a client

Create a client instance. You can name the file anything you want. Here we are creating `client.ts` file inside the `lib/` directory.

```ts title="auth-client.ts"
import { createAuthClient } from "better-auth/vue" // make sure to import from better-auth/vue

export const authClient = createAuthClient({
    //you can pass client configuration here
})
```

Once you have created the client, you can use it to sign up, sign in, and perform other actions.
Some of the actions are reactive.

### Example usage

```vue title="index.vue"
<script setup lang="ts">
import { authClient } from "~/lib/client"
const session = authClient.useSession()
</script>

<template>
    <div>
        <button v-if="!session?.data" @click="() => authClient.signIn.social({
            provider: 'github'
        })">
            Continue with GitHub
        </button>
        <div>
            <pre>{{ session.data }}</pre>
            <button v-if="session.data" @click="authClient.signOut()">
                Sign out
            </button>
        </div>
    </div>
</template>
```

### Server Usage

The `api` object exported from the auth instance contains all the actions that you can perform on the server. Every endpoint made inside Better Auth is a invocable as a function. Including plugins endpoints.

**Example: Getting Session on a server API route**

```tsx title="server/api/example.ts"
import { auth } from "~/lib/auth";

export default defineEventHandler((event) => {
    const session = await auth.api.getSession({
      headers: event.headers
    });

   if(session) {
     // access the session.session && session.user
   }
});
```


### SSR Usage

If you are using Nuxt with SSR, you can use the `useSession` function in the `setup` function of your page component and pass `useFetch` to make it work with SSR.

```vue title="index.vue"
<script setup lang="ts">
import { authClient } from "~/lib/auth-client";

const { data: session } = await authClient.useSession(useFetch);
</script>

<template>
    <p>
        {{ session }}
    </p>
</template>
```


### Middleware

To add middleware to your Nuxt project, you can use the `useSession` method from the client.

```ts title="middleware/auth.global.ts"
import { authClient } from "~/lib/auth-client";
export default defineNuxtRouteMiddleware(async (to, from) => {
	const { data: session } = await authClient.useSession(useFetch); 
	if (!session.value) {
		if (to.path === "/dashboard") {
			return navigateTo("/");
		}
	}
});
```

### Resources & Examples

- [Nuxt and Nuxt Hub example](https://github.com/atinux/nuxthub-better-auth) on GitHub.
- [NuxtZzle is Nuxt,Drizzle ORM example](https://github.com/leamsigc/nuxt-better-auth-drizzle) on GitHub [preview](https://nuxt-better-auth.giessen.dev/)
- [Nuxt example](https://stackblitz.com/github/better-auth/examples/tree/main/nuxt-example) on StackBlitz.
- [NuxSaaS (Github)](https://github.com/NuxSaaS/NuxSaaS) is a full-stack SaaS Starter Kit that leverages Better Auth for secure and efficient user authentication. [Demo](https://nuxsaas.com/)
- [NuxtOne (Github)](https://github.com/nuxtone/nuxt-one) is a Nuxt-based starter template for building AIaaS (AI-as-a-Service) applications [preview](https://www.one.devv.zone)
