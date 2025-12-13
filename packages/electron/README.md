# Better Auth Electron Plugin

This plugin integrates Better Auth with Electron, allowing you to easily add authentication to your Electron applications.

## Installation

To get started, install the necessary packages:

```bash
# Using npm
npm install better-auth @better-auth/electron

# Using yarn
yarn add better-auth @better-auth/electron

# Using pnpm
pnpm add better-auth @better-auth/electron

# Using bun
bun add better-auth @better-auth/electron
```

You will also need to install a storage solution, such as `electron-store`, for session and cookie storage in your Electron app:

```bash
npm install electron-store
# or
yarn add electron-store
# or
pnpm add electron-store
# or
bun add electron-store
```

We use Electron's `safeStorage` APIs to securely store sensitive data.

## Basic Usage

### Handling Authorization in the Browser

In order to redirect users back to your Electron app after authentication, you need to call the `ensureElectronRedirect` handler on every page on your frontend web application that should handle redirects. Also, make sure to pass all the required query parameters when initiating the sign-in or sign-up.

The following example uses React, but the concept applies to any frontend framework:

```tsx title="web/pages/sign-in.tsx"
import { useEffect, use } from "react";
import { authClient } from "../auth-client";

function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    client_id?: string | undefined;
    state?: string | undefined;
    code_challenge?: string | undefined;
    code_challenge_method?: string | undefined;
  }>;
}) {
  const query = use(searchParams);

  useEffect(() => {
    authClient.ensureElectronRedirect();
  }, []);

  return (
    <button
      onClick={() => {
        authClient.signIn.social({
          provider: "google",
          fetchOptions: {
            query,
          },
        });
      }}
    >
      Sign in
    </button>
  );
}
```

### Handling Authentication in Electron

In your Electron renderer process, you can now use the IPC bridges to handle authentication.

The following example uses React, but the concept applies to any frontend framework:

```tsx
// electron/App.tsx
function Auth() {
  useEffect(() => {
    window.onAuthenticated((session) => {
      console.log("User authenticated:", session);
    });
  }, []);

  return (
    <button
      onClick={async () => {
        await window.requestAuth();
      }}
    >
      Login in Browser
    </button>
  );
}
```

In the main process, you can call the `requestAuth` method directly on the `authClient` instance:

```ts
// electron/main.ts
await authClient.requestAuth();
```

## Documentation

For more detailed information and advanced configurations, please refer to the documentation:

- **Main Better Auth Installation:** [https://www.better-auth.com/docs/installation](https://www.better-auth.com/docs/installation)
- **Electron Integration Guide:** [https://www.better-auth.com/docs/integrations/electron](https://www.better-auth.com/docs/integrations/electron)

## License

MIT
