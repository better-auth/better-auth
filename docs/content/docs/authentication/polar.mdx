---
title: Polar
description: Polar provider setup and usage.
---

<Steps>
    <Step>
        ### Get your Polar credentials
        To use Polar sign in, you need to create an OAuth 2.0 Client. You can get your credentials from the [Polar User Settings](https://polar.sh/dashboard/account/developer).

        1. Go to your [Polar User Settings](https://polar.sh/settings#oauth)
        2. Click "Create OAuth Client"
        3. Fill in the required fields:
           - **Application Name**: The name shown to users during authorization
           - **Client Type**: Choose the appropriate client type for your application
           - **Redirect URIs**: Set to `http://localhost:3000/api/auth/callback/polar` for local development. For production, set it to `https://yourdomain.com/api/auth/callback/polar`. If you change the base path of the auth routes, update the redirect URI accordingly.
           - **Scopes**: Select the permissions your application needs (openid, profile, email are default)
           - **Homepage URL**: Your application's main URL

        4. Optionally, add:
           - Logo for your application
           - Terms of service URL
           - Privacy policy URL

        5. After creation, copy the Client ID and Client Secret to your environment variables. Keep these credentials secure.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"

        export const auth = betterAuth({
            socialProviders: {
                polar: { // [!code highlight]
                    clientId: process.env.POLAR_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.POLAR_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with Polar
        To sign in with Polar, you can use the `signIn.social` function provided by the client, where the `provider` should be set to `polar`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()

        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "polar"
            })
        }
        ```
    </Step>

</Steps>
