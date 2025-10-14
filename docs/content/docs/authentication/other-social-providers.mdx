---
title: Other Social Providers
description: Other social providers setup and usage.
---

Better Auth provides out of the box support for a [Generic OAuth Plugin](/docs/plugins/generic-oauth) which allows you to use any social provider that implements the OAuth2 protocol or OpenID Connect (OIDC) flows.

To use a provider that is not supported out of the box, you can use the [Generic OAuth Plugin](/docs/plugins/generic-oauth).

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

    const authClient = createAuthClient({
        plugins: [
            genericOAuthClient()
        ]
    })
    ```

  </Step>
</Steps>

<Callout>
  Read more about installation and usage of the Generic Oauth plugin
  [here](/docs/plugins/generic-oauth#usage).
</Callout>

## Example usage

### Instagram Example

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  // ... other config options
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "instagram",
          clientId: process.env.INSTAGRAM_CLIENT_ID as string,
          clientSecret: process.env.INSTAGRAM_CLIENT_SECRET as string,
          authorizationUrl: "https://api.instagram.com/oauth/authorize",
          tokenUrl: "https://api.instagram.com/oauth/access_token",
          scopes: ["user_profile", "user_media"],
        },
      ],
    }),
  ],
});
```

```ts title="sign-in.ts"
const response = await authClient.signIn.oauth2({
  providerId: "instagram",
  callbackURL: "/dashboard", // the path to redirect to after the user is authenticated
});
```

### Coinbase Example

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  // ... other config options
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "coinbase",
          clientId: process.env.COINBASE_CLIENT_ID as string,
          clientSecret: process.env.COINBASE_CLIENT_SECRET as string,
          authorizationUrl: "https://www.coinbase.com/oauth/authorize",
          tokenUrl: "https://api.coinbase.com/oauth/token",
          scopes: ["wallet:user:read"], // and more...
        },
      ],
    }),
  ],
});
```

```ts title="sign-in.ts"
const response = await authClient.signIn.oauth2({
  providerId: "coinbase",
  callbackURL: "/dashboard", // the path to redirect to after the user is authenticated
});
```
