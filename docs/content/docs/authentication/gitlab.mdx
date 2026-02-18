---
title: GitLab
description: GitLab provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your GitLab credentials
        To use GitLab sign in, you need a client ID and client secret. [GitLab OAuth documentation](https://docs.gitlab.com/ee/api/oauth2.html).

        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/gitlab` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({
            socialProviders: {
                gitlab: { // [!code highlight]
                    clientId: process.env.GITLAB_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.GITLAB_CLIENT_SECRET as string, // [!code highlight]
                    issuer: process.env.GITLAB_ISSUER as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```

        #### Configuration Options

        - `clientId`: Your GitLab application's Client ID
        - `clientSecret`: Your GitLab application's Client Secret  
        - `issuer`: (Optional) The URL of your GitLab instance. Use this for self-hosted GitLab servers.
            - Default: `"https://gitlab.com"` (GitLab.com)
            - Example: `"https://gitlab.company.com"`

        <Callout type="info">
            The `issuer` option is useful when using a self-hosted GitLab instance. If you're using GitLab.com, you can omit this option as it defaults to `https://gitlab.com`.
        </Callout>

        #### Example with self-hosted GitLab

        ```ts title="auth.ts"
        export const auth = betterAuth({
            socialProviders: {
                gitlab: {
                    clientId: process.env.GITLAB_CLIENT_ID as string,
                    clientSecret: process.env.GITLAB_CLIENT_SECRET as string,
                    issuer: "https://gitlab.company.com", // Your self-hosted GitLab URL // [!code highlight]
                },
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with GitLab
        To sign in with GitLab, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `gitlab`.

        ```ts title="auth-client.ts"  
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()
        
        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "gitlab"
            })
        }
        ```
    </Step>
</Steps>
