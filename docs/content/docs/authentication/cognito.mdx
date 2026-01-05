---
title: Cognito
description: Amazon Cognito provider setup and usage.
---

<Steps>
  <Step>
    ### Get your Cognito Credentials
    To integrate with Cognito, you need to set up a **User Pool** and an **App client** in the [Amazon Cognito Console](https://console.aws.amazon.com/cognito/).

    Follow these steps:
    1. Go to the **Cognito Console** and create a **User Pool**.
    2. Under **App clients**, create a new **App client** (note the Client ID and Client Secret if enabled).
    3. Go to **Domain** and set a Cognito Hosted UI domain (e.g., `your-app.auth.us-east-1.amazoncognito.com`).
    4. In **App client settings**, enable:
       - Allowed OAuth flows: `Authorization code grant`
       - Allowed OAuth scopes: `openid`, `profile`, `email`
    5. Add your callback URL (e.g., `http://localhost:3000/api/auth/callback/cognito`).

    <Callout type="info">
      - **User Pool is required** for Cognito authentication.  
      - Make sure the callback URL matches exactly what you configure in Cognito.   
    </Callout>
  </Step>

  <Step>
    ### Configure the provider
    Configure the `cognito` key in `socialProviders` key of your `auth` instance.

    ```ts title="auth.ts"
    import { betterAuth } from "better-auth";

    export const auth = betterAuth({
      socialProviders: {
        cognito: {
          clientId: process.env.COGNITO_CLIENT_ID as string, // [!code highlight]
          clientSecret: process.env.COGNITO_CLIENT_SECRET as string, // [!code highlight]
          domain: process.env.COGNITO_DOMAIN as string, // e.g. "your-app.auth.us-east-1.amazoncognito.com" [!code highlight]
          region: process.env.COGNITO_REGION as string, // e.g. "us-east-1" [!code highlight]
          userPoolId: process.env.COGNITO_USERPOOL_ID as string, // [!code highlight]
        },
      },
    })
    ```
  </Step>

  <Step>
    ### Sign In with Cognito
    To sign in with Cognito, use the `signIn.social` function from the client.  

    ```ts title="auth-client.ts"
    import { createAuthClient } from "better-auth/client"

    const authClient = createAuthClient()

    const signIn = async () => {
      const data = await authClient.signIn.social({
        provider: "cognito"
      })
    }
    ```
    
      ### Additional Options:
        - `scope`: Additional OAuth2 scopes to request (combined with default permissions).
            - Default: `"openid" "profile" "email"`
            - Common Cognito scopes:
              - `openid`: Required for OpenID Connect authentication
              - `profile`: Access to basic profile info
              - `email`: Access to user’s email
              - `phone`: Access to user’s phone number
              - `aws.cognito.signin.user.admin`: Grants access to Cognito-specific APIs
        - Note: You must configure the scopes in your Cognito App Client settings. [available scopes](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html#token-endpoint-userinfo)
        - `getUserInfo`: Custom function to retrieve user information from the Cognito UserInfo endpoint.  
       <Callout type="info">
        For more information about Amazon Cognito's scopes and API capabilities, refer to the [official documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html?utm_source).
        </Callout>
  </Step>
</Steps>
