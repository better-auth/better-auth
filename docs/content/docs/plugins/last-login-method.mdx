---
title: Last Login Method
description: Track and display the last authentication method used by users
---

The last login method plugin tracks the most recent authentication method used by users (email, OAuth providers, etc.). This enables you to display helpful indicators on login pages, such as "Last signed in with Google" or prioritize certain login methods based on user preferences.

## Installation

<Steps>
    <Step>
        ### Add the plugin to your auth config

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"
        import { lastLoginMethod } from "better-auth/plugins" // [!code highlight]

        export const auth = betterAuth({
            // ... other config options
            plugins: [
                lastLoginMethod() // [!code highlight]
            ]
        })
        ```
    </Step>
    <Step>
        ### Add the client plugin to your auth client

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        import { lastLoginMethodClient } from "better-auth/client/plugins" // [!code highlight]

        export const authClient = createAuthClient({
            plugins: [
                lastLoginMethodClient() // [!code highlight]
            ]
        })
        ```
    </Step>
</Steps>

## Usage

Once installed, the plugin automatically tracks the last authentication method used by users. You can then retrieve and display this information in your application.

### Getting the Last Used Method

The client plugin provides several methods to work with the last login method:

```ts title="app.tsx"
import { authClient } from "@/lib/auth-client"

// Get the last used login method
const lastMethod = authClient.getLastUsedLoginMethod()
console.log(lastMethod) // "google", "email", "github", etc.

// Check if a specific method was last used
const wasGoogle = authClient.isLastUsedLoginMethod("google")

// Clear the stored method
authClient.clearLastUsedLoginMethod()
```

### UI Integration Example

Here's how to use the plugin to enhance your login page:

```tsx title="sign-in.tsx"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function SignInPage() {
    const lastMethod = authClient.getLastUsedLoginMethod()
    
    return (
        <div className="space-y-4">
            <h1>Sign In</h1>
            
            {/* Email sign in */}
            <div className="relative">
                <Button 
                    onClick={() => authClient.signIn.email({...})}
                    variant={lastMethod === "email" ? "default" : "outline"}
                    className="w-full"
                >
                    Sign in with Email
                    {lastMethod === "email" && (
                        <Badge className="ml-2">Last used</Badge>
                    )}
                </Button>
            </div>
            
            {/* OAuth providers */}
            <div className="relative">
                <Button 
                    onClick={() => authClient.signIn.social({ provider: "google" })}
                    variant={lastMethod === "google" ? "default" : "outline"}
                    className="w-full"
                >
                    Continue with Google
                    {lastMethod === "google" && (
                        <Badge className="ml-2">Last used</Badge>
                    )}
                </Button>
            </div>
            
            <div className="relative">
                <Button 
                    onClick={() => authClient.signIn.social({ provider: "github" })}
                    variant={lastMethod === "github" ? "default" : "outline"}
                    className="w-full"
                >
                    Continue with GitHub
                    {lastMethod === "github" && (
                        <Badge className="ml-2">Last used</Badge>
                    )}
                </Button>
            </div>
        </div>
    )
}
```

## Database Persistence

By default, the last login method is stored only in cookies. For more persistent tracking and analytics, you can enable database storage.

<Steps>
    <Step>
        ### Enable database storage

        Set `storeInDatabase` to `true` in your plugin configuration:

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"
        import { lastLoginMethod } from "better-auth/plugins"

        export const auth = betterAuth({
            plugins: [
                lastLoginMethod({
                    storeInDatabase: true // [!code highlight]
                })
            ]
        })
        ```
    </Step>
    <Step>
        ### Run database migration

        The plugin will automatically add a `lastLoginMethod` field to your user table. Run the migration to apply the changes:

        <Tabs items={["migrate", "generate"]}>
            <Tab value="migrate">
            ```bash
            npx @better-auth/cli migrate
            ```
            </Tab>
            <Tab value="generate">
            ```bash
            npx @better-auth/cli generate
            ```
            </Tab>
        </Tabs>
    </Step>
    <Step>
        ### Access database field

        When database storage is enabled, the `lastLoginMethod` field becomes available in user objects:

        ```ts title="user-profile.tsx"
        import { auth } from "@/lib/auth"

        // Server-side access
        const session = await auth.api.getSession({ headers })
        console.log(session?.user.lastLoginMethod) // "google", "email", etc.

        // Client-side access via session
        const { data: session } = authClient.useSession()
        console.log(session?.user.lastLoginMethod)
        ```
    </Step>
</Steps>

### Database Schema

When `storeInDatabase` is enabled, the plugin adds the following field to the `user` table:

Table: `user`

<DatabaseTable
    fields={[
        { name: "lastLoginMethod", type: "string", description: "The last authentication method used by the user", isOptional: true },
    ]}
/>

### Custom Schema Configuration

You can customize the database field name:

```ts title="auth.ts"
import { betterAuth } from "better-auth"
import { lastLoginMethod } from "better-auth/plugins"

export const auth = betterAuth({
    plugins: [
        lastLoginMethod({
            storeInDatabase: true,
            schema: {
                user: {
                    lastLoginMethod: "last_auth_method" // Custom field name
                }
            }
        })
    ]
})
```

## Configuration Options

The last login method plugin accepts the following options:

### Server Options

```ts title="auth.ts"
import { betterAuth } from "better-auth"
import { lastLoginMethod } from "better-auth/plugins"

export const auth = betterAuth({
    plugins: [
        lastLoginMethod({
            // Cookie configuration
            cookieName: "better-auth.last_used_login_method", // Default: "better-auth.last_used_login_method"
            maxAge: 60 * 60 * 24 * 30, // Default: 30 days in seconds
            
            // Database persistence
            storeInDatabase: false, // Default: false
            
            // Custom method resolution
            customResolveMethod: (ctx) => {
                // Custom logic to determine the login method
                if (ctx.path === "/oauth/callback/custom-provider") {
                    return "custom-provider"
                }
                // Return null to use default resolution
                return null
            },
            
            // Schema customization (when storeInDatabase is true)
            schema: {
                user: {
                    lastLoginMethod: "custom_field_name"
                }
            }
        })
    ]
})
```

**cookieName**: `string`
- The name of the cookie used to store the last login method
- Default: `"better-auth.last_used_login_method"`
- **Note**: This cookie is `httpOnly: false` to allow client-side JavaScript access for UI features

**maxAge**: `number`  
- Cookie expiration time in seconds
- Default: `2592000` (30 days)

**storeInDatabase**: `boolean`
- Whether to store the last login method in the database
- Default: `false`
- When enabled, adds a `lastLoginMethod` field to the user table

**customResolveMethod**: `(ctx: GenericEndpointContext) => string | null`
- Custom function to determine the login method from the request context
- Return `null` to use the default resolution logic
- Useful for custom OAuth providers or authentication flows

**schema**: `object`
- Customize database field names when `storeInDatabase` is enabled
- Allows mapping the `lastLoginMethod` field to a custom column name

### Client Options

```ts title="auth-client.ts"
import { createAuthClient } from "better-auth/client"
import { lastLoginMethodClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    plugins: [
        lastLoginMethodClient({
            cookieName: "better-auth.last_used_login_method" // Default: "better-auth.last_used_login_method"
        })
    ]
})
```

**cookieName**: `string`
- The name of the cookie to read the last login method from
- Must match the server-side `cookieName` configuration
- Default: `"better-auth.last_used_login_method"`

### Default Method Resolution

By default, the plugin tracks these authentication methods:

- **Email authentication**: `"email"`
- **OAuth providers**: Provider ID (e.g., `"google"`, `"github"`, `"discord"`)
- **OAuth2 callbacks**: Provider ID from URL path
- **Sign up methods**: Tracked the same as sign in methods

The plugin automatically detects the method from these endpoints:
- `/callback/:id` - OAuth callback with provider ID
- `/oauth2/callback/:id` - OAuth2 callback with provider ID  
- `/sign-in/email` - Email sign in
- `/sign-up/email` - Email sign up

## Cross-Domain Support

The plugin automatically inherits cookie settings from Better Auth's centralized cookie system. This solves the problem where the last login method wouldn't persist across:

- **Cross-subdomain setups**: `auth.example.com` → `app.example.com`
- **Cross-origin setups**: `api.company.com` → `app.different.com`

When you enable `crossSubDomainCookies` or `crossOriginCookies` in your Better Auth config, the plugin will automatically use the same domain, secure, and sameSite settings as your session cookies, ensuring consistent behavior across your application.

## Advanced Examples

### Custom Provider Tracking

If you have custom OAuth providers or authentication methods, you can use the `customResolveMethod` option:

```ts title="auth.ts"
import { betterAuth } from "better-auth"
import { lastLoginMethod } from "better-auth/plugins"

export const auth = betterAuth({
    plugins: [
        lastLoginMethod({
            customResolveMethod: (ctx) => {
                // Track custom SAML provider
                if (ctx.path === "/saml/callback") {
                    return "saml"
                }
                
                // Track magic link authentication
                if (ctx.path === "/magic-link/verify") {
                    return "magic-link"
                }
                
                // Track phone authentication
                if (ctx.path === "/sign-in/phone") {
                    return "phone"
                }
                
                // Return null to use default logic
                return null
            }
        })
    ]
})
```


