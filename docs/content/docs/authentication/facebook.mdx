---
title: Facebook
description: Facebook provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Facebook credentials
        To use Facebook sign in, you need a client ID and client Secret. You can get them from the [Facebook Developer Portal](https://developers.facebook.com/).
        Select your app, navigate to **App Settings > Basic**, locate the following:  
        - **App ID**: This is your `clientId`
        - **App Secret**: This is your `clientSecret`.

        <Callout type="warn">
        Avoid exposing the `clientSecret` in client-side code (e.g., frontend apps) because it’s sensitive information.
        </Callout>

        Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/facebook` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to import the provider and pass it to the `socialProviders` option of the auth instance.

        ```ts title="auth.ts"  
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({
            socialProviders: {
                facebook: { // [!code highlight]
                    clientId: process.env.FACEBOOK_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.FACEBOOK_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```

        <Callout>
        BetterAuth also supports Facebook Login for Business, all you need
        to do is provide the `configId` as listed in **Facebook Login For Business > Configurations** alongside your `clientId` and `clientSecret`. Note that the app must be a Business app and, since BetterAuth expects to have an email address and account id, the configuration must be of the "User access token" type. "System-user access token" is not supported.
        </Callout>
    </Step>
       <Step>
        ### Sign In with Facebook
        To sign in with Facebook, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
        - `provider`: The provider to use. It should be set to `facebook`.

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/auth-client"
        const authClient = createAuthClient()

        const signIn = async () => {
            const data = await authClient.signIn.social({
                provider: "facebook"
            })
        }
        ```
    </Step>
</Steps>

## Additional Configuration

### Scopes
By default, Facebook provides basic user information. If you need additional permissions, you can specify scopes in your auth configuration:

```ts title="auth.ts"
export const auth = betterAuth({
    socialProviders: {
        facebook: {
            clientId: process.env.FACEBOOK_CLIENT_ID as string,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET as string,
            scopes: ["email", "public_profile", "user_friends"], // Overwrites permissions
            fields: ["user_friends"], // Extending list of fields
        },
    },
})
```

Additional options:
- `scopes`: Access basic account information (overwrites).
    - Default: `"email", "public_profile"`
- `fields`: Extend list of fields to retrieve from the Facebook user profile (assignment).
    - Default: `"id", "name", "email", "picture"`

### Sign In with Facebook With ID or Access Token

To sign in with Facebook using the ID Token, you can use the `signIn.social` function to pass the ID Token.

This is useful when you have the ID Token from Facebook on the client-side and want to use it to sign in on the server.

<Callout>
 If ID token is provided no redirection will happen, and the user will be signed in directly.
</Callout>

For limited login, you need to pass `idToken.token`, for only `accessToken` you need to pass `idToken.accessToken` and `idToken.token` together because of (#1183)[https://github.com/better-auth/better-auth/issues/1183].


```ts title="auth-client.ts"
const data = await authClient.signIn.social({
    provider: "facebook",
    idToken: {  // [!code highlight]
        ...(platform === 'ios' ?  // [!code highlight]
            { token: idToken }  // [!code highlight]
            : { token: accessToken, accessToken: accessToken }), // [!code highlight]
    },
})
```

For a complete list of available permissions, refer to the [Permissions Reference](https://developers.facebook.com/docs/permissions).
