---
title: Dropbox
description: Dropbox provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Dropbox credentials
        To use Dropbox sign in, you need a client ID and client secret. You can get them from the [Dropbox Developer Portal](https://www.dropbox.com/developers). You can Allow "Implicit Grant & PKCE" for the application in the App Console.
        
        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/dropbox` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.
    </Step>

    If you need deeper dive into Dropbox Authentication, you can check out the [official documentation](https://developers.dropbox.com/oauth-guide).

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"

        export const auth = betterAuth({
            socialProviders: {
                dropbox: { // [!code highlight]
                    clientId: process.env.DROPBOX_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.DROPBOX_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with Dropbox
        To sign in with Dropbox, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `dropbox`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()

        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "dropbox"
            })
        }
        ```
    </Step>

</Steps>
