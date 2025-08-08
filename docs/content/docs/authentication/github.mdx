---
title: GitHub
description: GitHub provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your GitHub credentials
        To use GitHub sign in, you need a client ID and client secret. You can get them from the [GitHub Developer Portal](https://github.com/settings/developers).

        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/github` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.

        Important: You MUST include the user:email scope in your GitHub app. See details below.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({
            socialProviders: {
                github: { // [!code highlight]
                    clientId: process.env.GITHUB_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.GITHUB_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with GitHub
        To sign in with GitHub, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `github`.

        ```ts title="auth-client.ts"  
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()
        
        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "github"
            })
        }
        ```
    </Step>
</Steps>

## Usage

### Setting up your Github app

Github has two types of apps: Github apps and OAuth apps.

For OAuth apps, you don't have to do anything special (just follow the steps above). For Github apps, you DO have to add one more thing, which is enable it to read the user's email:

1. After creating your app, go to *Permissions and Events* > *Account Permissions* > *Email Addresses* and select "Read-Only"

2. Save changes. 

That's all! Now you can copy the Client ID and Client Secret of your app! 

<Callout>
If you get "email_not_found" error, it's because you selected a Github app & did not configure this part!
</Callout>

### Why don't I have a refresh token?

Github doesn't issue refresh tokens for OAuth apps. For regular OAuth apps,
GitHub issues access tokens that remain valid indefinitely unless the user revokes them,
the app revokes them, or they go unused for a year.
There's no need for a refresh token because the access token doesn't expire on a short interval like Google or Discord.
