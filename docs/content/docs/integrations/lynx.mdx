---
title: Lynx Integration
description: Integrate Better Auth with Lynx cross-platform framework.
---

This integration guide is for using Better Auth with [Lynx](https://lynxjs.org), a cross-platform rendering framework that enables developers to build applications for Android, iOS, and Web platforms with native rendering performance.

Before you start, make sure you have a Better Auth instance configured. If you haven't done that yet, check out the [installation](/docs/installation).

## Installation

Install Better Auth and the Lynx React dependency:

```package-install
better-auth @lynx-js/react
```

## Create Client Instance

Import `createAuthClient` from `better-auth/lynx` to create your client instance:

```ts title="lib/auth-client.ts"
import { createAuthClient } from "better-auth/lynx"

export const authClient = createAuthClient({
    baseURL: "http://localhost:3000" // The base URL of your auth server
})
```

## Usage

The Lynx client provides the same API as other Better Auth clients, with optimized integration for Lynx's reactive system.

### Authentication Methods

```ts
import { authClient } from "./lib/auth-client"

// Sign in with email and password
await authClient.signIn.email({
    email: "test@user.com",
    password: "password1234"
})

// Sign up
await authClient.signUp.email({
    email: "test@user.com", 
    password: "password1234",
    name: "John Doe"
})

// Sign out
await authClient.signOut()
```

### Hooks

The Lynx client includes reactive hooks that integrate seamlessly with Lynx's component system:

#### useSession

```tsx title="components/user.tsx"
import { authClient } from "../lib/auth-client"

export function User() {
    const {
        data: session,
        isPending, // loading state
        error // error object 
    } = authClient.useSession()

    if (isPending) return <div>Loading...</div>
    if (error) return <div>Error: {error.message}</div>

    return (
        <div>
            {session ? (
                <div>
                    <p>Welcome, {session.user.name}!</p>
                    <button onClick={() => authClient.signOut()}>
                        Sign Out
                    </button>
                </div>
            ) : (
                <button onClick={() => authClient.signIn.social({
                    provider: 'github'
                })}>
                    Sign In with GitHub
                </button>
            )}
        </div>
    )
}
```

### Store Integration

The Lynx client uses [nanostores](https://github.com/nanostores/nanostores) for state management and provides a `useStore` hook for accessing reactive state:

```tsx title="components/session-info.tsx"
import { useStore } from "better-auth/lynx"
import { authClient } from "../lib/auth-client"

export function SessionInfo() {
    // Access the session store directly
    const session = useStore(authClient.$store.session)
    
    return (
        <div>
            {session && (
                <pre>{JSON.stringify(session, null, 2)}</pre>
            )}
        </div>
    )
}
```

### Advanced Store Usage

You can use the store with selective key watching for optimized re-renders:

```tsx title="components/optimized-user.tsx"
import { useStore } from "better-auth/lynx"
import { authClient } from "../lib/auth-client"

export function OptimizedUser() {
    // Only re-render when specific keys change
    const session = useStore(authClient.$store.session, {
        keys: ['user.name', 'user.email'] // Only watch these specific keys
    })
    
    return (
        <div>
            {session?.user && (
                <div>
                    <h2>{session.user.name}</h2>
                    <p>{session.user.email}</p>
                </div>
            )}
        </div>
    )
}
```

## Plugin Support

The Lynx client supports all Better Auth plugins:

```ts title="lib/auth-client.ts"
import { createAuthClient } from "better-auth/lynx"
import { magicLinkClient } from "better-auth/client/plugins"

const authClient = createAuthClient({
    plugins: [
        magicLinkClient()
    ]
})

// Use plugin methods
await authClient.signIn.magicLink({
    email: "test@email.com"
})
```

## Error Handling

Error handling works the same as other Better Auth clients:

```tsx title="components/login-form.tsx"
import { authClient } from "../lib/auth-client"

export function LoginForm() {
    const signIn = async (email: string, password: string) => {
        const { data, error } = await authClient.signIn.email({
            email,
            password
        })
        
        if (error) {
            console.error('Login failed:', error.message)
            return
        }
        
        console.log('Login successful:', data)
    }
    
    return (
        <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            signIn(formData.get('email'), formData.get('password'))
        }}>
            <input name="email" type="email" placeholder="Email" />
            <input name="password" type="password" placeholder="Password" />
            <button type="submit">Sign In</button>
        </form>
    )
}
```

## Features

The Lynx client provides:

- **Cross-Platform Support**: Works across Android, iOS, and Web platforms
- **Optimized Performance**: Built specifically for Lynx's reactive system
- **Nanostores Integration**: Uses nanostores for efficient state management  
- **Selective Re-rendering**: Watch specific store keys to minimize unnecessary updates
- **Full API Compatibility**: All Better Auth methods and plugins work seamlessly
- **TypeScript Support**: Full type safety with TypeScript inference

The Lynx integration maintains all the features and benefits of Better Auth while providing optimal performance and developer experience within Lynx's cross-platform ecosystem.