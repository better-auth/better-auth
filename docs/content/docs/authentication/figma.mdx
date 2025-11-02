---
title: Figma
description: Figma provider setup and usage.
---

<Steps>
    <Step>
        ### Get your Credentials
        1. Sign in to your Figma account and go to the [Developer Apps page](https://www.figma.com/developers/apps)
        2. Click "Create new app"
        3. Fill out the app details (name, description, etc.)
        4. Configure your redirect URI (e.g., `https://yourdomain.com/api/auth/callback/figma`)
        5. Note your Client ID and Client Secret

        <Callout type="info">
            - The default scope is `file_read`. For additional scopes like `file_write`, refer to the [Figma OAuth documentation](https://www.figma.com/developers/api#oauth2).
        </Callout>

        Make sure to set the redirect URI to match your application's callback URL. If you change the base path of the auth routes, you should update the redirect URI accordingly.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"

        export const auth = betterAuth({
            socialProviders: {
                figma: { // [!code highlight]
                    clientId: process.env.FIGMA_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.FIGMA_CLIENT_SECRET as string, // [!code highlight]
                    clientKey: process.env.FIGMA_CLIENT_KEY as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with Figma
        To sign in with Figma, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `figma`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()

        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "figma"
            })
        }
        ```
        <Callout type="info">
        For more information about Figma's OAuth scopes and API capabilities, refer to the [official Figma API documentation](https://www.figma.com/developers/api).
        </Callout>
    </Step>

</Steps>
