---
title: One-Time Token Plugin
description: Generate and verify single-use token
---

The One-Time Token (OTT) plugin provides functionality to generate and verify secure, single-use session tokens. These are commonly used for across domains authentication.

## Installation

<Steps>
  <Step>
    ### Add the plugin to your auth config

    To use the One-Time Token plugin, add it to your auth config.

    ```ts title="auth.ts"
    import { betterAuth } from "better-auth";
    import { oneTimeToken } from "better-auth/plugins/one-time-token";
    
    export const auth = betterAuth({
        plugins: [
          oneTimeToken()
        ]
        // ... other auth config
    });
    ```
  </Step>

  <Step>
    ### Add the client plugin

    Next, include the one-time-token client plugin in your authentication client instance.

    ```ts title="auth-client.ts"
    import { createAuthClient } from "better-auth/client"
    import { oneTimeTokenClient } from "better-auth/client/plugins"
    
    export const authClient = createAuthClient({
        plugins: [
            oneTimeTokenClient()
        ]
    })
    ```
  </Step>
</Steps>

## Usage

### 1. Generate a Token

Generate a token using `auth.api.generateOneTimeToken` or `authClient.oneTimeToken.generate`

<APIMethod
  path="/one-time-token/generate"
  method="GET"
  requireSession
>
```ts
type generateOneTimeToken = {
}
```
</APIMethod>

This will return a `token` that is attached to the current session which can be used to verify the one-time token. By default, the token will expire in 3 minutes.

### 2. Verify the Token

When the user clicks the link or submits the token, use the `auth.api.verifyOneTimeToken` or `authClient.oneTimeToken.verify` method in another API route to validate it.

<APIMethod path="/one-time-token/verify" method="POST">
```ts
type verifyOneTimeToken = {
    /**
     * The token to verify. 
     */
    token: string = "some-token"
}
```
</APIMethod>

This will return the session that was attached to the token.

## Options

These options can be configured when adding the `oneTimeToken` plugin:

*   **`disableClientRequest`** (boolean): Optional. If `true`, the token will only be generated on the server side. Default: `false`.
*   **`expiresIn`** (number): Optional. The duration for which the token is valid in minutes. Default: `3`.

```ts
oneTimeToken({
    expiresIn: 10 // 10 minutes
})
```
* **`generateToken`**: A custom token generator function that takes `session` object and a `ctx` as parameters.

* **`storeToken`**: Optional. This option allows you to configure how the token is stored in your database.

    * **`plain`**: The token is stored in plain text. (Default)
    * **`hashed`**: The token is hashed using the default hasher.
    * **`custom-hasher`**: A custom hasher function that takes a token and returns a hashed token.

<Callout type="info">
    Note: It will not affect the token that's sent, it will only affect the token stored in your database.
</Callout>

Examples:

```ts title="No hashing (default)"
oneTimeToken({
    storeToken: "plain"
})
```
```ts title="built-in hasher"
oneTimeToken({
    storeToken: "hashed"
})
```
```ts title="custom hasher"
oneTimeToken({
    storeToken: {
        type: "custom-hasher",
        hash: async (token) => {
            return myCustomHasher(token);
        }
    }
})
```
