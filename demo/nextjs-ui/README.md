# Better Auth UI Demo

This demo showcases the embedded `<Auth />` component from Better Auth.

## Features

- **Embedded Auth Component**: Sign in and sign up forms embedded directly in your pages
- **Automatic Theme Detection**: Inherits your shadcn/ui theme automatically
- **Event Callbacks**: Handle success, error, and load events
- **Session Management**: Automatic session updates via signal propagation

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Run the development server:

```bash
pnpm dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note**: This demo uses an in-memory database, so data will be lost when the server restarts. For production use, configure a persistent database adapter.

## Pages

- `/` - Landing page with links to auth pages
- `/login` - Sign in page using embedded `<Auth />` component
- `/register` - Sign up page using embedded `<Auth />` component
- `/dashboard` - Protected dashboard showing session info
- `/auth/sign-in` - Full-page sign in (direct access)
- `/auth/sign-up` - Full-page sign up (direct access)

## Key Files

- `src/lib/auth.ts` - Better Auth server configuration (using memory adapter)
- `src/lib/auth-client.ts` - Better Auth client configuration
- `src/app/api/auth/[...all]/route.ts` - API route handler
- `src/app/auth/[...all]/route.ts` - UI handler for full pages
- `src/app/login/page.tsx` - Example using `<Auth />` component

## How the Auth Component Works

The `<Auth />` component embeds the Better Auth UI in an iframe:

```tsx
import { authClient } from "@/lib/auth-client";
import { Auth } from "better-auth/react/Auth";

function LoginPage() {
  return (
    <Auth
      ui={authClient.ui.signIn()}
      onSuccess={(data) => router.push(data.redirectTo || "/dashboard")}
      onError={(error) => console.error(error.message)}
      $store={authClient.$store}
    />
  );
}
```

Features:
- **`ui`**: Specifies which auth page to display (`signIn()`, `signUp()`, etc.)
- **`onSuccess`**: Called when authentication succeeds
- **`onError`**: Called when authentication fails
- **`$store`**: Connects to the auth client's store for session updates
