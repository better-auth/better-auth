---
title: Microsoft
description: Microsoft provider setup and usage.
---

Enabling OAuth with Microsoft Azure Entra ID (formerly Active Directory) allows your users to sign in and sign up to your application with their Microsoft account.

<Steps>
    <Step> 
        ### Get your Microsoft credentials
        To use Microsoft as a social provider, you need to get your Microsoft credentials. Which involves generating your own Client ID and Client Secret using your Microsoft Entra ID dashboard account.

        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/microsoft` for local development. For production, you should change it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.

        see the [Microsoft Entra ID documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app) for more information.
    </Step>

    <Step>
    ### Configure the provider
    To configure the provider, you need to pass the `clientId` and `clientSecret` to `socialProviders.microsoft` in your auth configuration.

    ```ts title="auth.ts"
    import { betterAuth } from "better-auth"

    export const auth = betterAuth({
        socialProviders: {
            microsoft: { // [!code highlight]
                clientId: process.env.MICROSOFT_CLIENT_ID as string, // [!code highlight]
                clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string, // [!code highlight]
                // Optional
                tenantId: 'common', // [!code highlight]                
                authority: "https://login.microsoftonline.com", // Authentication authority URL // [!code highlight]
                prompt: "select_account", // Forces account selection // [!code highlight]
            }, // [!code highlight]
        },
    })
    ```
    
    **Authority URL**: Use the default `https://login.microsoftonline.com` for standard Entra ID scenarios or `https://<tenant-id>.ciamlogin.com` for CIAM (Customer Identity and Access Management) scenarios.
    
    </Step>

</Steps>

## Sign In with Microsoft

To sign in with Microsoft, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:

- `provider`: The provider to use. It should be set to `microsoft`.

```ts title="auth-client.ts"
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient();

const signIn = async () => {
  const data = await authClient.signIn.social({
    provider: "microsoft",
    callbackURL: "/dashboard", // The URL to redirect to after the sign in
  });
};
```
