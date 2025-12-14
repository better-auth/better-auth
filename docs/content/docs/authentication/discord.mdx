---
title: Discord
description: Discord provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Discord credentials
        To use Discord sign in, you need a client ID and client secret. You can get them from the [Discord Developer Portal](https://discord.com/developers/applications).

        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/discord` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts" 
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({ 
            socialProviders: {
                discord: { // [!code highlight]
                    clientId: process.env.DISCORD_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.DISCORD_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
</Steps>

## Usage

### Sign In with Discord 

To sign in with Discord, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
- `provider`: The provider to use. It should be set to `discord`.

```ts title="auth-client.ts"
import { createAuthClient } from "better-auth/client"
const authClient =  createAuthClient()

const signIn = async () => {
    const data = await authClient.signIn.social({
        provider: "discord"
    })
}
```

## Options

For the full list of options supported by all social providers, check the [Provider Options](/docs/concepts/oauth#provider-options).

### Bot Permissions (Optional)

If you're using the `bot` scope with Discord OAuth, you can specify bot permissions using the `permissions` option. It can either be a bitwise value (e.g `2048 | 16384` for Send Messages and Embed Links) or a specific permission value (e.g `16384` for Embed Links).

```ts title="auth.ts" 
import { betterAuth } from "better-auth"

export const auth = betterAuth({ 
    socialProviders: {
        discord: {
            clientId: process.env.DISCORD_CLIENT_ID as string,
            clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
            permissions: 2048 | 16384, // Send Messages + Embed Links // [!code highlight]
        }, 
    },
})
```

**Note:** The `permissions` parameter only works when the `bot` scope is included in your OAuth2 scopes. Read more about [Discord bot permissions](https://discord.com/developers/docs/topics/permissions).