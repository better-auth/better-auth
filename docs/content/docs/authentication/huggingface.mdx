---
title: Hugging Face
description: Hugging Face provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Hugging Face credentials
        To use Hugging Face sign in, you need a client ID and client secret. [Hugging Face OAuth documentation](https://huggingface.co/docs/hub/oauth). Make sure the created oauth app on Hugging Face has the "email" scope.

        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/huggingface` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({
            socialProviders: {
                huggingface: { // [!code highlight]
                    clientId: process.env.HUGGINGFACE_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.HUGGINGFACE_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with Hugging Face
        To sign in with Hugging Face, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `huggingface`.

        ```ts title="auth-client.ts"  
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()
        
        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "huggingface"
            })
        }
        ```
    </Step>
</Steps>
