---
title: Linear
description: Linear provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Linear credentials
        To use Linear sign in, you need a client ID and client secret. You can get them from the [Linear Developer Portal](https://linear.app/settings/api).

        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/linear` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.

        When creating your OAuth application in Linear, you'll need to specify the required scopes. The default scope is `read`, but you can also request additional scopes like `write` if needed.
    </Step>

    <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({
            socialProviders: {
                linear: { // [!code highlight]
                    clientId: process.env.LINEAR_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.LINEAR_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>

    <Step>
        ### Sign In with Linear
        To sign in with Linear, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `linear`.

        ```ts title="auth-client.ts"  
        import { createAuthClient } from "better-auth/client"
        const authClient = createAuthClient()
        
        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "linear"
            })
        }
        ```
    </Step>

    <Step>
        ### Available scopes
        Linear OAuth supports the following scopes:
        - `read` (default): Read access for the user's account
        - `write`: Write access for the user's account
        - `issues:create`: Allows creating new issues and their attachments
        - `comments:create`: Allows creating new issue comments
        - `timeSchedule:write`: Allows creating and modifying time schedules
        - `admin`: Full access to admin level endpoints (use with caution)

        You can specify additional scopes when configuring the provider:

        ```ts title="auth.ts"
        export const auth = betterAuth({
            socialProviders: {
                linear: {
                    clientId: process.env.LINEAR_CLIENT_ID as string,
                    clientSecret: process.env.LINEAR_CLIENT_SECRET as string,
                    scope: ["read", "write"] // [!code highlight]
                },
            },
        })
        ```
    </Step>
</Steps>
