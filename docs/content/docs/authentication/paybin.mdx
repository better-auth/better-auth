---
title: Paybin
description: Paybin provider setup and usage.
---

<Steps>
    <Step>
        ### Get your Paybin credentials
        To use Paybin sign in, you need to create an OAuth 2.0 Client through your Paybin Portfolio application.

        1. Log in to your [Paybin Portfolio](https://portfolio.paybin.io)
        2. Navigate to Developer Settings or OAuth Applications section
        3. Click "Create OAuth Application" or "New Application"
        4. Fill in the required fields:
           - **Application Name**: The name shown to users during authorization
           - **Redirect URIs**: Set to `http://localhost:3000/api/auth/callback/paybin` for local development. For production, set it to `https://yourdomain.com/api/auth/callback/paybin`. If you change the base path of the auth routes, update the redirect URI accordingly.

        5. After creation, copy the Client ID and Client Secret to your environment variables. Keep these credentials secure.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"

        export const auth = betterAuth({
            socialProviders: {
                paybin: { // [!code highlight]
                    clientId: process.env.PAYBIN_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.PAYBIN_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
    <Step>
        ### Sign In with Paybin
        To sign in with Paybin, you can use the `signIn.social` function provided by the client, where the `provider` should be set to `paybin`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        const authClient = createAuthClient()

        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "paybin"
            })
        }
        ```
    </Step>

</Steps>

## Additional Configuration

### Scopes
By default, Paybin provider requests the following scopes: `openid`, `email`, and `profile`. You can customize the scopes based on your application's needs.

For a complete list of available scopes and their descriptions, see the [Paybin OIDC Scopes Documentation](https://developers.paybin.io/knowledge-center/oidc#available-scopes).

```ts title="auth.ts"
export const auth = betterAuth({
    socialProviders: {
        paybin: {
            clientId: process.env.PAYBIN_CLIENT_ID as string,
            clientSecret: process.env.PAYBIN_CLIENT_SECRET as string,
            scope: ["openid", "email", "profile", "transactions"], // [!code highlight]
        },
    },
})
```

### User Profile Mapping
Paybin returns user information in the ID token following OpenID Connect standards. The provider automatically extracts:
- `id` from `sub` claim
- `name` from `name`, `preferred_username`, or `email` (in order of preference)
- `email` from `email` claim
- `image` from `picture` claim
- `emailVerified` from `email_verified` claim
