# @better-auth/ui

Pre-built authentication UI pages for Better Auth. This package provides  sign-in, sign-up, password reset, and profile pages built with React and Tailwind CSS.

## Overview

This package builds pre-compiled authentication UI pages that are bundled into the main `better-auth` package. Users can expose a `uiHandler` at any route, and Better Auth will serve these auth pages automatically.

## Pages Included

- **Sign In** (`/sign-in`) - Email/password login with social provider support
- **Sign Up** (`/sign-up`) - User registration with configurable fields
- **Forgot Password** (`/forgot-password`) - Password reset request
- **Reset Password** (`/reset-password`) - Set new password via reset link
- **Verify Email** (`/verify-email`) - Email verification confirmation
- **Profile** (`/profile`) - User profile management

## Installation

```bash
pnpm add @better-auth/ui
```

## Usage

### Basic Setup

Enable the UI by adding the `ui` option to your Better Auth configuration:

```typescript
import { betterAuth } from "better-auth";

const auth = betterAuth({
  // ... other options
  ui: {
    enabled: true,
    basePath: "/auth",
    redirectTo: "/dashboard",
  },
});
```

Then mount the `uiHandler` in your framework:

```typescript
// Express
app.use("/auth/*", auth.uiHandler);

// Hono
app.route("/auth/*", auth.uiHandler);
```

### Configuration Options

```typescript
ui: {
  // Enable/disable the UI (default: true when ui option is provided)
  enabled: true,
  
  // Base path for UI routes (default: "/auth")
  basePath: "/auth",
  
  // Where to redirect after successful auth (default: "/")
  redirectTo: "/dashboard",
  
  // Custom API base URL (defaults to your Better Auth baseURL + basePath)
  apiBaseUrl: "https://api.myapp.com/api/auth",
  
  // Theme customization
  theme: {
    appName: "My App",
    logo: "/logo.png",
    primaryColor: "#0066cc",
    backgroundColor: "#ffffff",
    textColor: "#1a1a1a",
    borderRadius: "8px",
    fontFamily: "Inter, system-ui, sans-serif",
    darkMode: {
      enabled: true,
      backgroundColor: "#1a1a1a",
      textColor: "#ffffff",
    },
  },
  
  // Enable/disable individual pages
  pages: {
    signIn: { enabled: true },
    signUp: { enabled: true },
    forgotPassword: { enabled: true },
    resetPassword: { enabled: true },
    verifyEmail: { enabled: true },
    profile: { enabled: true },
  },
}
```

## Architecture

### How It Works

The package has two distinct parts:

1. **Client-side React App** - A Vite-built single-page application that renders the authentication pages
2. **Server-side Utilities** - Functions to load and serve the compiled assets

When a user visits an auth page (e.g., `/auth/sign-in`), the Better Auth UI handler:

1. Serves the pre-built HTML with injected runtime configuration
2. The React app reads configuration from `window.__BETTER_AUTH_UI__`
3. The UI automatically adapts based on your Better Auth configuration

### Feature Detection

The UI automatically detects and adapts to your configuration:

- **Social Providers** - Shows buttons for configured OAuth providers (Google, GitHub, etc.)
- **Email/Password** - Shows/hides based on `emailAndPassword.enabled`
- **Passkey** - Shows passkey option if the passkey plugin is enabled
- **Magic Link** - Shows magic link option if the magic-link plugin is enabled
- **Email Verification** - Adapts flow based on `emailVerification.sendOnSignUp`

### Runtime Configuration

Configuration is injected at runtime, allowing the same build to serve different configurations:

```typescript
interface BetterAuthUIConfig {
  apiBaseUrl: string;
  appName: string;
  logo?: string;
  redirectTo: string;
  socialProviders: Array<{ id: string; name: string; icon?: string }>;
  features: {
    emailPassword: boolean;
    passkey: boolean;
    magicLink: boolean;
    rememberMe: boolean;
    emailVerification: boolean;
  };
  paths: {
    signIn: string;
    signUp: string;
    forgotPassword: string;
    resetPassword: string;
    verifyEmail: string;
    profile: string;
  };
  minPasswordLength: number;
  page: "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "verify-email" | "profile";
}
```

## Server-Side API

For advanced use cases, you can import the asset utilities directly:

```typescript
import { loadAssets, getAssetPaths, getDistPath } from "@better-auth/ui";

// Load all assets into memory (cached)
const assets = loadAssets();
// assets.html - HTML template
// assets.js - React application bundle
// assets.css - Tailwind CSS styles

// Get paths to asset files
const paths = getAssetPaths();
// paths.html, paths.js, paths.css

// Get the dist directory path
const distPath = getDistPath();
```

## Tech Stack

- **React 19** - UI framework
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library (Radix UI primitives)
- **Vite** - Build tool
- **TypeScript** - Type safety

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Type check
pnpm typecheck
```

## License

MIT
