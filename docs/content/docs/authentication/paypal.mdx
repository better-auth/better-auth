---
title: PayPal
description: Paypal provider setup and usage.
---

<Steps>
    <Step>
        ### Get your PayPal Credentials
        To integrate with PayPal, you need to obtain API credentials by creating an application in the [PayPal Developer Portal](https://developer.paypal.com/dashboard).

         Follow these steps:
            1. Create an account on the PayPal Developer Portal
            2. Create a new application, [official docs]( https://developer.paypal.com/developer/applications/)
            3. Configure Log in with PayPal under "Other features"
            4. Set up your Return URL (redirect URL)
            5. Configure user information permissions
            6. Note your Client ID and Client Secret

        <Callout type="info">
            - PayPal has two environments: Sandbox (for testing) and Live (for production)
            - For testing, create sandbox test accounts in the Developer Dashboard under "Sandbox" → "Accounts"
            - You cannot use your real PayPal account to test in sandbox mode - you must use the generated test accounts
            - The Return URL in your PayPal app settings must exactly match your redirect URI
            - The PayPal API does not work with localhost. You need to use a public domain for the redirect URL and HTTPS for local testing. You can use [NGROK](https://ngrok.com/) or another similar tool for this.
        </Callout>
         Make sure to configure "Log in with PayPal" in your app settings:
            1. Go to your app in the Developer Dashboard
            2. Under "Other features", check "Log in with PayPal"
            3. Click "Advanced Settings"
            4. Enter your Return URL
            5. Select the user information you want to access (email, name, etc.)
            6. Enter Privacy Policy and User Agreement URLs

        <Callout type="info">
            - PayPal doesn't use traditional OAuth2 scopes in the authorization URL. Instead, you configure permissions directly in the Developer Dashboard
            - For live apps, PayPal must review and approve your application before it can go live, which typically takes a few weeks
        </Callout>
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"

        export const auth = betterAuth({
            socialProviders: {
                paypal: { // [!code highlight]
                    clientId: process.env.PAYPAL_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.PAYPAL_CLIENT_SECRET as string, // [!code highlight]
                    environment: "sandbox", // or "live" for production //, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
        #### Options
        The PayPal provider accepts the following options:
    
        - `environment`: `'sandbox' | 'live'` - PayPal environment to use (default: `'sandbox'`)
        - `requestShippingAddress`: `boolean` - Whether to request shipping address information (default: `false`)
    
        ```ts title="auth.ts"
        export const auth = betterAuth({
            socialProviders: {
                paypal: {
                    clientId: process.env.PAYPAL_CLIENT_ID as string,
                    clientSecret: process.env.PAYPAL_CLIENT_SECRET as string,
                    environment: "live", // Use "live" for production
                    requestShippingAddress: true, // Request address info
                },
            },
        })
        ```
    </Step>
       <Step>
        ### Sign In with PayPal
        To sign in with PayPal, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `paypal`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        const authClient =  createAuthClient()

        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "paypal"
            })
        }
        ```
        ### Additional Options:
        - `environment`: PayPal environment to use.
            - Default: `"sandbox"`
            - Options: `"sandbox"` | `"live"`
        - `requestShippingAddress`: Whether to request shipping address information.
            - Default: `false`
        - `scope`: Additional scopes to request (combined with default permissions).
            - Default: Configured in PayPal Developer Dashboard
            - Note: PayPal doesn't use traditional OAuth2 scopes - permissions are set in the Dashboard
            For more details refer to the [Scopes Reference](https://developer.paypal.com/docs/log-in-with-paypal/integrate/reference/#scope-attributes)
        - `mapProfileToUser`: Custom function to map PayPal profile data to user object.
        - `getUserInfo`: Custom function to retrieve user information.
        For more details refer to the [User Reference](https://developer.paypal.com/docs/api/identity/v1/#userinfo_get)
        - `verifyIdToken`: Custom ID token verification function.   
    </Step>

</Steps>
