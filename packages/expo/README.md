# Better Auth Expo Plugin

This plugin integrates Better Auth with Expo, allowing you to easily add authentication to your Expo (React Native) applications. It supports both Expo native and web apps.

## Installation

To get started, install the necessary packages:

```bash
# Using npm
npm install better-auth @better-auth/expo

# Using yarn
yarn add better-auth @better-auth/expo

# Using pnpm
pnpm add better-auth @better-auth/expo

# Using bun
bun add better-auth @better-auth/expo
```

You will also need to install `expo-secure-store` for secure session and cookie storage in your Expo app:

```bash
npm install expo-secure-store
# or
yarn add expo-secure-store
# or
pnpm add expo-secure-store
# or
bun add expo-secure-store
```

## Basic Usage

### Configure the Better Auth Backend

Ensure you have a Better Auth backend set up. You can follow the main [Installation Guide](https://www.better-auth.com/docs/installation).

Then, add the Expo plugin to your Better Auth server configuration (e.g., in your `auth.ts` or `lib/auth.ts` file):

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo"; // Import the server plugin

export const auth = betterAuth({
    // ...your other Better Auth options
    baseURL: "http://localhost:8081", // The base URL of your application server where the routes are mounted.
    plugins: [expo()], // Add the Expo server plugin
    emailAndPassword: { 
        enabled: true,
    },
    // Add other configurations like trustedOrigins
    trustedOrigins: ["myapp://"] // Replace "myapp" with your app's scheme
});
```

### Initialize the Better Auth Client in Expo

In your Expo app, initialize the client (e.g., in `lib/auth-client.ts`):

```typescript
// lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client"; // Import the client plugin
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
    baseURL: "http://localhost:8081", // Your Better Auth backend URL
    plugins: [
        expoClient({
            scheme: "myapp", // Your app's scheme (defined in app.json)
            storagePrefix: "myapp", // A prefix for storage keys
            storage: SecureStore, // Pass SecureStore for token storage
        })
    ]
});

// You can also export specific methods if you prefer:
// export const { signIn, signUp, useSession } = authClient;
```
Make sure your app's scheme (e.g., "myapp") is defined in your `app.json`.

## Documentation

For more detailed information and advanced configurations, please refer to the documentation:

- **Main Better Auth Installation:** [https://www.better-auth.com/docs/installation](https://www.better-auth.com/docs/installation)
- **Expo Integration Guide:** [https://www.better-auth.com/docs/integrations/expo](https://www.better-auth.com/docs/integrations/expo)

## License

MIT
