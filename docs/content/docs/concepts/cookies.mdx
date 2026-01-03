---
title: Cookies
description: Learn how cookies are used in Better Auth.
---

Cookies are used to store data such as session tokens, session data, OAuth state, and more. All cookies are signed using the `secret` key provided in the auth options or the `BETTER_AUTH_SECRET` environment variable.

### Cookie Prefix

By default, Better Auth cookies follow the format `${prefix}.${cookie_name}`. The default prefix is "better-auth". You can change the prefix by setting `cookiePrefix` in the `advanced` object of the auth options.

```ts title="auth.ts"
import { betterAuth } from "better-auth"

export const auth = betterAuth({
    advanced: {
        cookiePrefix: "my-app"
    }
})
```

### Custom Cookies

All cookies are `httpOnly` and `secure` when the server is running in production mode.

If you want to set custom cookie names and attributes, you can do so by setting `cookieOptions` in the `advanced` object of the auth options.

By default, Better Auth uses the following cookies:

- `session_token` to store the session token
- `session_data` to store the session data if cookie cache is enabled
- `dont_remember` to store the flag when `rememberMe` is disabled

Plugins may also use cookies to store data. For example, the Two Factor Authentication plugin uses the `two_factor` cookie to store the two-factor authentication state.

```ts title="auth.ts"
import { betterAuth } from "better-auth"

export const auth = betterAuth({
    advanced: {
        cookies: {
            session_token: {
                name: "custom_session_token",
                attributes: {
                    // Set custom cookie attributes
                }
            },
        }
    }
})
```

### Cross Subdomain Cookies

Sometimes you may need to share cookies across subdomains. 
For example, if you authenticate on `auth.example.com`, you may also want to access the same session on `app.example.com`.

<Callout type="warn">
The `domain` attribute controls which domains can access the cookie. Setting it to your root domain (e.g. `example.com`) makes the cookie accessible across all subdomains. For security, follow these guidelines:

1. Only enable cross-subdomain cookies if it's necessary
2. Set the domain to the most specific scope needed (e.g. `app.example.com` instead of `.example.com`)
3. Be cautious of untrusted subdomains that could potentially access these cookies
4. Consider using separate domains for untrusted services (e.g. `status.company.com` vs `app.company.com`)
</Callout>

```ts title="auth.ts"
import { betterAuth } from "better-auth"

export const auth = betterAuth({
    advanced: {
        crossSubDomainCookies: {
            enabled: true,
            domain: "app.example.com", // your domain
        },
    },
    trustedOrigins: [
        'https://example.com',
        'https://app1.example.com',
        'https://app2.example.com',
    ],
})
```
### Secure Cookies

By default, cookies are secure only when the server is running in production mode. You can force cookies to be always secure by setting `useSecureCookies` to `true` in the `advanced` object in the auth options.

```ts title="auth.ts"
import { betterAuth } from "better-auth"

export const auth = betterAuth({
    advanced: {
        useSecureCookies: true
    }
})
```