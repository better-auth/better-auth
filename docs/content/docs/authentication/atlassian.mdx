---
title: Atlassian
description: Atlassian provider setup and usage.
---

<Steps>
    <Step>
        ### Get your Credentials
        1. Sign in to your Atlassian account and go to the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
        2. Click "Create new app"
        3. Fill out the app details
        4. Configure your redirect URI (e.g., `https://yourdomain.com/api/auth/callback/atlassian`)
        5. Note your Client ID and Client Secret

        <Callout type="info">
            - The default scope is `read:jira-user` and `offline_access`. For additional scopes, refer to the [Atlassian OAuth documentation](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/).
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
                atlassian: { // [!code highlight]
                    clientId: process.env.ATLASSIAN_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.ATLASSIAN_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with Atlassian
        To sign in with Atlassian, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `atlassian`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()

        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "atlassian"
            })
        }
        ```
        <Callout type="info">
        For more information about Atlassian's OAuth scopes and API capabilities, refer to the [official Atlassian OAuth 2.0 (3LO) apps documentation](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/).
        </Callout>
    </Step>

</Steps>
