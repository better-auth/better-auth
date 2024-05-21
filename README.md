# Better Auth

The Authentication Library for Javascript.

## Installation

```bash
pnpm install better-auth@beta @better-auth/client@beta
```

## Usage

> Start by creating a folder called auth in your project somewhere.

>  Create two files `server.ts` and `client.ts` in the auth folder.

> In the `server.ts` file, create a betterAuth instance.See the example below.

```typescript
import { betterAuth } from 'better-auth';
import { prismaAdapter } from "better-auth/adapters/prisma-adapter"
import { github } from "better-auth/providers"

export const auth = betterAuth({
    //database adapter
    adapter: prismaAdapter(prisma),
    //auth providers
    providers: [github({
        clientId: "",
        clientSecret: ""
    })],
   /**
    * better auth requires you to define a user schema.
    * The only field assumed to be present is the id 
    * field.
    */
    user: {
        fields: {
            email: {
                type: "string"
            },
            emailVerified: {
                type: "boolean"
            },
            name: {
                type: "string"
            },
            image: {
                type: "string"
            }
        }
    }
})
```
> Now you need to mount the handler on your application.

#### Next JS
`app/api/[...auth]/routes.ts`
```typescript
import { handler } from "@/lib/auth/server";
import { toNextJSHandler } from "better-auth/next";

export const { GET, POST } = toNextJSHandler(handler);
```

#### SvelteKit
`src/hooks.server.ts`
```typescript
import { auth } from "$lib/auth/server";
import { svelteKitHandler } from "better-auth/svelte-kit";

export async function handle({ event, resolve }) {
	return svelteKitHandler({ auth, event, resolve });
}
```

> In the `client.ts` file, create a client betterAuth instance. See the example below.

> Make sure to import the `auth` instance from the `server.ts` file as a type and pass it to the `createAuthClient` function. That will be used to infer from your auth config on the server.

```typescript
import { createAuthClient } from "@better-auth/client"
import type { auth } from "./server"

export const client = createAuthClient<typeof auth>()({
    baseURL: "http://localhost:3000" //the base url of the server
})
```

> Now you can use the client instance to authenticate users in your client side code. See the example below.

```typescript
import { client } from "@lib/auth/client"

const loginWithGithub = async () => {
    const user = await client.signInOrSignUp({
        provider: "github",
        //this data will be used to create a user if the user does not exist
        data: {
            email: "email" //this is mapping the field to the response from the provider
            name: "name",
            image: "avatar_url",
            emailVerified: {
                value: true //you can pass a static value like this
            }
        },
        callbackUrl: "http://localhost:3000/dashboard" //the url to redirect to after authentication. This is optional.
    })
}
```
>  You can use useSession (on react) or subscribe (on other frameworks) to get the current session.

`React`
```typescript
import { client } from "@lib/auth/client"

const User = () => {
    const session = client.session.use()
    return (
        <div>
            {session && <p>{session.user.email}</p>}
        </div>
    )
}
```

`Svelte`
```sv
<script>
    import { client } from "$lib/auth/client";
    let session: typeof client.$inferSession | null = null;
    client.session.subscribe((value) => {
        session = value;
    });
</script>
    {#if $session}
        <p>{$session.user.email}</p>
    {/if}
    ```
```
