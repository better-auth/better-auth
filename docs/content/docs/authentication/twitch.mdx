---
title: Twitch
description: Twitch provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Twitch Credentials
        To use Twitch sign in, you need a client ID and client secret. You can get them from the [Twitch Developer Portal](https://dev.twitch.tv/console/apps).

        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/twitch` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"  
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({
            socialProviders: {
                twitch: { // [!code highlight]
                    clientId: process.env.TWITCH_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.TWITCH_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            }
        })
        ```
    </Step>
       <Step>
        ### Sign In with Twitch 
        To sign in with Twitch, you can use the `signIn.social` function provided by the client.
        The `signIn` function takes an object with the following properties:

        - `provider`: The provider to use. It should be set to `twitch`.

        ```ts title="auth-client.ts"  
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()
        
        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "twitch"
            })
        }
        ```

        <Callout type="warn">
            Twitch users who do not have an email address will not be able to sign in.
        </Callout>
    </Step>
</Steps>
