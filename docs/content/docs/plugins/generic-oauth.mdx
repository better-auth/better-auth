---
title: Generic OAuth
description: Authenticate users with any OAuth provider
---

The Generic OAuth plugin provides a flexible way to integrate authentication with any OAuth provider. It supports both OAuth 2.0 and OpenID Connect (OIDC) flows, allowing you to easily add social login or custom OAuth authentication to your application.

## Installation

<Steps>
  <Step>
    ### Add the plugin to your auth config

    To use the Generic OAuth plugin, add it to your auth config.

    ```ts title="auth.ts"
    import { betterAuth } from "better-auth"
    import { genericOAuth } from "better-auth/plugins" // [!code highlight]
    
    export const auth = betterAuth({
        // ... other config options
        plugins: [ 
            genericOAuth({ // [!code highlight]
                config: [ // [!code highlight]
                    { // [!code highlight] 
                        providerId: "provider-id", // [!code highlight]
                        clientId: "test-client-id", // [!code highlight]
                        clientSecret: "test-client-secret", // [!code highlight]
                        discoveryUrl: "https://auth.example.com/.well-known/openid-configuration", // [!code highlight]
                        // ... other config options // [!code highlight]
                    }, // [!code highlight]
                    // Add more providers as needed // [!code highlight]
                ] // [!code highlight]
            }) // [!code highlight]
        ]
    })
    ```
  </Step>

  <Step>
    ### Add the client plugin

    Include the Generic OAuth client plugin in your authentication client instance.

    ```ts title="auth-client.ts"
    import { createAuthClient } from "better-auth/client"
    import { genericOAuthClient } from "better-auth/client/plugins"
    
    export const authClient = createAuthClient({
        plugins: [
            genericOAuthClient()
        ]
    })
    ```
  </Step>
</Steps>

## Usage

The Generic OAuth plugin provides endpoints for initiating the OAuth flow and handling the callback. Here's how to use them:

### Initiate OAuth Sign-In

To start the OAuth sign-in process:

<APIMethod path="/sign-in/oauth2" method="POST">
```ts
type signInWithOAuth2 = {
    /**
     * The provider ID for the OAuth provider. 
     */
    providerId: string = "provider-id"
    /**
     * The URL to redirect to after sign in. 
     */
    callbackURL?: string = "/dashboard"
    /**
     * The URL to redirect to if an error occurs. 
     */
    errorCallbackURL?: string = "/error-page"
    /**
     * The URL to redirect to after login if the user is new. 
     */
    newUserCallbackURL?: string = "/welcome"
    /**
     * Disable redirect. 
     */
    disableRedirect?: boolean = false
    /**
     * Scopes to be passed to the provider authorization request. 
     */
    scopes?: string[] = ["my-scope"]
    /**
     * Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider. 
     */
    requestSignUp?: boolean = false
}
```
</APIMethod>

### Linking OAuth Accounts

To link an OAuth account to an existing user:

<APIMethod
  path="/oauth2/link"
  method="POST"
  requireSession
>
```ts
type oAuth2LinkAccount = {
    /**
     * The OAuth provider ID. 
     */
    providerId: string = "my-provider-id"
    /**
     * The URL to redirect to once the account linking was complete. 
     */
    callbackURL: string = "/successful-link"
}
```
</APIMethod>

### Handle OAuth Callback

The plugin mounts a route to handle the OAuth callback `/oauth2/callback/:providerId`. This means by default `${baseURL}/api/auth/oauth2/callback/:providerId` will be used as the callback URL. Make sure your OAuth provider is configured to use this URL.

## Configuration

When adding the plugin to your auth config, you can configure multiple OAuth providers. Each provider configuration object supports the following options:

```ts
interface GenericOAuthConfig {
  providerId: string;
  discoveryUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  redirectURI?: string;
  responseType?: string;
  prompt?: string;
  pkce?: boolean;
  accessType?: string;
  getUserInfo?: (tokens: OAuth2Tokens) => Promise<User | null>;
}
```

### Other Provider Configurations

**providerId**: A unique string to identify the OAuth provider configuration.

**discoveryUrl**: (Optional) URL to fetch the provider's OAuth 2.0/OIDC configuration. If provided, endpoints like `authorizationUrl`, `tokenUrl`, and `userInfoUrl` can be auto-discovered.

**authorizationUrl**: (Optional) The OAuth provider's authorization endpoint. Not required if using `discoveryUrl`.

**tokenUrl**: (Optional) The OAuth provider's token endpoint. Not required if using `discoveryUrl`.

**userInfoUrl**: (Optional) The endpoint to fetch user profile information. Not required if using `discoveryUrl`.

**clientId**: The OAuth client ID issued by your provider.

**clientSecret**: The OAuth client secret issued by your provider.

**scopes**: (Optional) An array of scopes to request from the provider (e.g., `["openid", "email", "profile"]`).

**redirectURI**: (Optional) The redirect URI to use for the OAuth flow. If not set, a default is constructed based on your app's base URL.

**responseType**: (Optional) The OAuth response type. Defaults to `"code"` for authorization code flow.

**responseMode**: (Optional) The response mode for the authorization code request, such as `"query"` or `"form_post"`.

**prompt**: (Optional) Controls the authentication experience (e.g., force login, consent, etc.).

**pkce**: (Optional) If true, enables PKCE (Proof Key for Code Exchange) for enhanced security. Defaults to `false`.

**accessType**: (Optional) The access type for the authorization request. Use `"offline"` to request a refresh token.

**getUserInfo**: (Optional) A custom function to fetch user info from the provider, given the OAuth tokens. If not provided, a default fetch is used.

**mapProfileToUser**: (Optional) A function to map the provider's user profile to your app's user object. Useful for custom field mapping or transformations.

**authorizationUrlParams**: (Optional) Additional query parameters to add to the authorization URL. These can override default parameters. You can also provide a function that returns the parameters.

**tokenUrlParams**: (Optional) Additional query parameters to add to the token URL. These can override default parameters. You can also provide a function that returns the parameters.

**disableImplicitSignUp**: (Optional) If true, disables automatic sign-up for new users. Sign-in must be explicitly requested with sign-up intent.

**disableSignUp**: (Optional) If true, disables sign-up for new users entirely. Only existing users can sign in.

**authentication**: (Optional) The authentication method for token requests. Can be `'basic'` or `'post'`. Defaults to `'post'`.

**discoveryHeaders**: (Optional) Custom headers to include in the discovery request. Useful for providers that require special headers.

**authorizationHeaders**: (Optional) Custom headers to include in the authorization request. Useful for providers that require special headers.

**overrideUserInfo**: (Optional) If true, the user's info in your database will be updated with the provider's info every time they sign in. Defaults to `false`.

## Advanced Usage

### Custom User Info Fetching

You can provide a custom `getUserInfo` function to handle specific provider requirements:

```ts
genericOAuth({
  config: [
    {
      providerId: "custom-provider",
      // ... other config options
      getUserInfo: async (tokens) => {
        // Custom logic to fetch and return user info
        const userInfo = await fetchUserInfoFromCustomProvider(tokens);
        return {
          id: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
          // ... map other fields as needed
        };
      }
    }
  ]
})
```

### Map User Info Fields

If the user info returned by the provider does not match the expected format, or you need to map additional fields, you can use the `mapProfileToUser`:

```ts
genericOAuth({
  config: [
    {
      providerId: "custom-provider",
      // ... other config options
      mapProfileToUser: async (profile) => {
        return {
          firstName: profile.given_name,
          // ... map other fields as needed
        };
      }
    }
  ]
})
```

### Error Handling

The plugin includes built-in error handling for common OAuth issues. Errors are typically redirected to your application's error page with an appropriate error message in the URL parameters. If the callback URL is not provided, the user will be redirected to Better Auth's default error page.

