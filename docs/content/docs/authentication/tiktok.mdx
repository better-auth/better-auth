---
title: TikTok
description: TikTok provider setup and usage.
---

<Steps>
    <Step>
        ### Get your TikTok Credentials
        To integrate with TikTok, you need to obtain API credentials by creating an application in the [TikTok Developer Portal](https://developers.tiktok.com/apps).

        Follow these steps:
        1. Create an account on the TikTok Developer Portal
        2. Create a new application
        3. Set up a sandbox environment for testing
        4. Configure your redirect URL (must be HTTPS)
        5. Note your Client Secret and Client Key

        <Callout type="info">
            - The TikTok API does not work with localhost. You need to use a public domain for the redirect URL and HTTPS for local testing. You can use [NGROK](https://ngrok.com/) or another similar tool for this.
            - For testing, you will need to use the [Sandbox mode](https://developers.tiktok.com/blog/introducing-sandbox), which you can enable in the TikTok Developer Portal.
            - The default scope is `user.info.profile`. For additional scopes, refer to the [Available Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes/) documentation.
        </Callout>

        Make sure to set the redirect URL to a valid HTTPS domain for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.

        <Callout type="info">
            - The TikTok API does not provide email addresses. As a workaround, this implementation uses the user's `username` value for the `email` field, which is why it requires the `user.info.profile` scope instead of just `user.info.basic`.
            - For production use, you will need to request approval from TikTok for the scopes you intend to use.
        </Callout>
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"

        export const auth = betterAuth({
            socialProviders: {
                tiktok: { // [!code highlight]
                    clientSecret: process.env.TIKTOK_CLIENT_SECRET as string, // [!code highlight]
                    clientKey: process.env.TIKTOK_CLIENT_KEY as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with TikTok
        To sign in with TikTok, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `tiktok`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()

        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "tiktok"
            })
        }
        ```
    </Step>

</Steps>
