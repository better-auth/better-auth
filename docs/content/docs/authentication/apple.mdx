---
title: Apple
description: Apple provider setup and usage.
---
<Steps>
    <Step>
        ### Get your OAuth credentials
        To use Apple sign in, you need a client ID and client secret. You can get them from the [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list).

        You will need an active **Apple Developer account** to access the developer portal and generate these credentials.

        Follow these steps to set up your App ID, Service ID, and generate the key needed for your client secret:

        1.  **Navigate to Certificates, Identifiers & Profiles:**
            In the Apple Developer Portal, go to the "Certificates, Identifiers & Profiles" section.

        2.  **Create an App ID:**
            *   Go to the `Identifiers` tab.
            *   Click the `+` icon next to Identifiers.
            *   Select `App IDs`, then click `Continue`.
            *   Select `App` as the type, then click `Continue`.
            *   **Description:** Enter a name for your app (e.g., "My Awesome App"). This name may be displayed to users when they sign in.
            *   **Bundle ID:** Set a bundle ID. The recommended format is a reverse domain name (e.g., `com.yourcompany.yourapp`). Using a suffix like `.ai` (for app identifier) can help with organization but is not required (e.g., `com.yourcompany.yourapp.ai`).
            *   Scroll down to **Capabilities**. Select the checkbox for `Sign In with Apple`.
            *   Click `Continue`, then `Register`.

        3.  **Create a Service ID:**
            *   Go back to the `Identifiers` tab.
            *   Click the `+` icon.
            *   Select `Service IDs`, then click `Continue`.
            *   **Description:** Enter a description for this service (e.g., your app name again).
            *   **Identifier:** Set a unique identifier for the service. Use a reverse domain format, distinct from your App ID (e.g., `com.yourcompany.yourapp.si`, where `.si` indicates service identifier - this is for your organization and not required). **This Service ID will be your `clientId`.**
            *   Click `Continue`, then `Register`.

        4.  **Configure the Service ID:**
            *   Find the Service ID you just created in the `Identifiers` list and click on it.
            *   Check the `Sign In with Apple` capability, then click `Configure`.
            *   Under **Primary App ID**, select the App ID you created earlier (e.g., `com.yourcompany.yourapp.ai`).
            *   Under **Domains and Subdomains**, list all the root domains you will use for Sign In with Apple (e.g., `example.com`, `anotherdomain.com`).
            *   Under **Return URLs**, enter the callback URL. `https://yourdomain.com/api/auth/callback/apple`. Add all necessary return URLs.
            *   Click `Next`, then `Done`.
            *   Click `Continue`, then `Save`.

        5.  **Create a Client Secret Key:**
            *   Go to the `Keys` tab.
            *   Click the `+` icon to create a new key.
            *   **Key Name:** Enter a name for the key (e.g., "Sign In with Apple Key").
            *   Scroll down and select the checkbox for `Sign In with Apple`.
            *   Click the `Configure` button next to `Sign In with Apple`.
            *   Select the **Primary App ID** you created earlier.
            *   Click `Save`, then `Continue`, then `Register`.
            *   **Download the Key:** Immediately download the `.p8` key file. **This file is only available for download once.** Note the Key ID (available on the Keys page after creation) and your Team ID (available in your Apple Developer Account settings).

        6.  **Generate the Client Secret (JWT):**
            Apple requires a JSON Web Token (JWT) to be generated dynamically using the downloaded `.p8` key, the Key ID, and your Team ID. This JWT serves as your `clientSecret`.

            You can use the guide below from [Apple's documentation](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret) to understand how to generate this client secret. You can also use our built in generator [below](#generate-apple-client-secret-jwt) to generate the client secret JWT required for 'Sign in with Apple'.

            **Note:** Apple allows a maximum expiration of 6 months (180 days) for the client secret JWT. You will need to regenerate the client secret before it expires to maintain uninterrupted authentication.


    </Step>
    <Step>
        ### Configure the provider
        To configure the provider, you need to add it to the `socialProviders` option of the auth instance.

        You also need to add `https://appleid.apple.com` to the `trustedOrigins` array in your auth instance configuration to allow communication with Apple's authentication servers.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"

        export const auth = betterAuth({
            socialProviders: {
                apple: { // [!code highlight]
                    clientId: process.env.APPLE_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.APPLE_CLIENT_SECRET as string, // [!code highlight]
                    // Optional
                    appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER as string, // [!code highlight]
                }, // [!code highlight]
            },
            // Add appleid.apple.com to trustedOrigins for Sign In with Apple flows
            trustedOrigins: ["https://appleid.apple.com"], // [!code highlight]
        })
        ```

        On native iOS, it doesn't use the service ID but the app ID (bundle ID) as client ID, so if using the service ID as `clientId` in `signIn.social` with `idToken`, it throws an error: `JWTClaimValidationFailed: unexpected "aud" claim value`. So you need to provide the `appBundleIdentifier` when you want to sign in with Apple using the ID Token.
    </Step>
</Steps>

<Callout type="warn">
**Localhost and Non-TLS Restrictions**

Apple Sign In does **not** support `localhost` or non-HTTPS URLs. During development:
- You cannot use `http://localhost` as a return URL
- You must use a domain with valid HTTPS/TLS certificate

This limitation is enforced by Apple's security requirements and cannot be bypassed.
</Callout>

## Usage

### Sign In with Apple

To sign in with Apple, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
- `provider`: The provider to use. It should be set to `apple`.

```ts title="auth-client.ts"  /
import { createAuthClient } from "better-auth/client"
const authClient =  createAuthClient()

const signIn = async () => {
    const data = await authClient.signIn.social({
        provider: "apple"
    })
}
```


### Sign In with Apple With ID Token

To sign in with Apple using the ID Token, you can use the `signIn.social` function to pass the ID Token. 

This is useful when you have the ID Token from Apple on the client-side and want to use it to sign in on the server.

<Callout>
 If ID token is provided no redirection will happen, and the user will be signed in directly.
</Callout>

```ts title="auth-client.ts"
await authClient.signIn.social({
    provider: "apple",
    idToken: {
        token: // Apple ID Token,
        nonce: // Nonce (optional)
        accessToken: // Access Token (optional)
    }
})
```

## Generate Apple Client Secret (JWT)

<GenerateAppleJwt />
