---
title: Reddit
description: Reddit provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Reddit Credentials
        To use Reddit sign in, you need a client ID and client secret. You can get them from the [Reddit Developer Portal](https://www.reddit.com/prefs/apps).

        1. Click "Create App" or "Create Another App"
        2. Select "web app" as the application type
        3. Set the redirect URL to `http://localhost:3000/api/auth/callback/reddit` for local development
        4. For production, set it to your application's domain (e.g. `https://example.com/api/auth/callback/reddit`)
        5. After creating the app, you'll get the client ID (under the app name) and client secret

        If you change the base path of the auth routes, make sure to update the redirect URL accordingly.
    </Step>

    <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({
            socialProviders: {
                reddit: {
                    clientId: process.env.REDDIT_CLIENT_ID as string,
                    clientSecret: process.env.REDDIT_CLIENT_SECRET as string,
                },
            },
        })
        ```
    </Step>

    <Step>
        ### Sign In with Reddit
        To sign in with Reddit, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `reddit`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        const authClient = createAuthClient()
        
        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "reddit"
            })
        }
        ```
    </Step>
</Steps>

## Additional Configuration

### Scopes
By default, Reddit provides basic user information. If you need additional permissions, you can specify scopes in your auth configuration:

```ts title="auth.ts"
export const auth = betterAuth({
    socialProviders: {
        reddit: {
            clientId: process.env.REDDIT_CLIENT_ID as string,
            clientSecret: process.env.REDDIT_CLIENT_SECRET as string,
            duration: "permanent",
            scope: ["read", "submit"] // Add required scopes
        },
    },
})
```

Common Reddit scopes include:
- `identity`: Access basic account information
- `read`: Access posts and comments
- `submit`: Submit posts and comments
- `subscribe`: Manage subreddit subscriptions
- `history`: Access voting history

For a complete list of available scopes, refer to the [Reddit OAuth2 documentation](https://www.reddit.com/dev/api/oauth).
