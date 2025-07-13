# Better Auth - Complete API Reference

**Version:** 1.2.12  
**Description:** The most comprehensive authentication library for TypeScript  
**Repository:** https://github.com/better-auth/better-auth  
**License:** MIT

## Overview

Better Auth is a framework-agnostic authentication and authorization library for TypeScript that provides comprehensive features out of the box with a plugin ecosystem for advanced functionalities like 2FA, multi-tenant support, and more.

## Installation

```bash
npm install better-auth
# or
pnpm add better-auth
# or
yarn add better-auth
```

## Quick Start

```typescript
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";

// Server-side setup
const auth = betterAuth({
  baseURL: "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: {
    dialect: "postgres",
    url: process.env.DATABASE_URL
  },
  emailAndPassword: {
    enabled: true
  }
});

// Client-side setup
const authClient = createAuthClient({
  baseURL: "http://localhost:3000"
});
```


# Core Authentication API

## Main Entry Point

### `betterAuth(options)`
**Import:** `import { betterAuth } from "better-auth"`

The main function to initialize Better Auth with configuration options.

**Signature:**
```typescript
export const betterAuth = <O extends BetterAuthOptions>(
  options: O & Record<never, never>
) => Auth
```

**Returns:**
```typescript
type Auth = {
  handler: (request: Request) => Promise<Response>;
  api: FilterActions<ReturnType<typeof router>["endpoints"]>;
  options: BetterAuthOptions;
  $ERROR_CODES: typeof BASE_ERROR_CODES;
  $context: Promise<AuthContext>;
  $Infer: {
    Session: {
      session: PrettifyDeep<InferSession<O>>;
      user: PrettifyDeep<InferUser<O>>;
    };
  } & InferPluginTypes<O>;
}
```

## Core Configuration Types

### `BetterAuthOptions`
**Import:** `import type { BetterAuthOptions } from "better-auth/types"`

Main configuration interface for Better Auth initialization.

**Key Properties:**
```typescript
interface BetterAuthOptions {
  // Basic Configuration
  appName?: string;                    // Default: "Better Auth"
  baseURL?: string;                    // Base URL for auth endpoints
  basePath?: string;                   // Default: "/api/auth"
  secret?: string;                     // Encryption/signing secret
  
  // Database Configuration
  database?: PostgresPool | MysqlPool | Database | Dialect | AdapterInstance | BunDatabase | KyselyConfig;
  
  // Secondary Storage (for sessions/rate limiting)
  secondaryStorage?: SecondaryStorage;
  
  // Email & Password Authentication
  emailAndPassword?: {
    enabled: boolean;
    disableSignUp?: boolean;
    requireEmailVerification?: boolean;
    minPasswordLength?: number;        // Default: 8
    maxPasswordLength?: number;        // Default: 128
    sendResetPassword?: (data: { user: User; url: string; token: string }, request?: Request) => Promise<void>;
    resetPasswordTokenExpiresIn?: number; // Default: 3600 (1 hour)
    password?: {
      hash: (password: string) => Promise<string>;
      verify: (data: { password: string; hash: string }) => Promise<boolean>;
    };
  };
  
  // Email Verification
  emailVerification?: {
    sendVerificationEmail?: (data: { user: User; url: string; token: string }, request?: Request) => Promise<void>;
    sendOnSignUp?: boolean;            // Default: false
    autoSignInAfterVerification?: boolean;
    expiresIn?: number;                // Default: 3600 (1 hour)
    onEmailVerification?: (user: User, request?: Request) => Promise<void>;
  };
  
  // Session Configuration
  session?: {
    updateAge?: number;                // Default: 86400 (24 hours)
    expiresIn?: number;                // Default: 604800 (7 days)
    freshAge?: number;                 // Default: 86400 (24 hours)
  };
  
  // Rate Limiting
  rateLimit?: {
    enabled?: boolean;                 // Default: true in production
    window?: number;                   // Default: 10 seconds
    max?: number;                      // Default: 100 requests
    storage?: "memory" | "database" | "secondary-storage";
  };
  
  // Social Providers
  socialProviders?: SocialProviders;
  
  // Trusted Origins
  trustedOrigins?: string[] | ((request: Request) => Promise<string[]>);
  
  // Plugins
  plugins?: BetterAuthPlugin[];
  
  // Advanced Configuration
  advanced?: {
    generateId?: (options: { model: string; size?: number }) => string;
    database?: {
      generateId?: (options: { model: string; size?: number }) => string;
    };
  };
  
  // Database Hooks
  databaseHooks?: {
    user?: {
      create?: { before?: Function; after?: Function };
      update?: { before?: Function; after?: Function };
    };
    session?: {
      create?: { before?: Function; after?: Function };
      update?: { before?: Function; after?: Function };
    };
  };
  
  // Logging
  logger?: {
    level?: "debug" | "info" | "warn" | "error";
    disabled?: boolean;
  };
}
```

## Core Data Models

### `User`
**Import:** `import type { User } from "better-auth/types"`

```typescript
interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### `Session`
**Import:** `import type { Session } from "better-auth/types"`

```typescript
interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### `Account`
**Import:** `import type { Account } from "better-auth/types"`

```typescript
interface Account {
  id: string;
  providerId: string;
  accountId: string;
  userId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scope?: string | null;
  password?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```


# Client API

## Core Client

### Main Client Factory
**Import Path:** `better-auth/client`

```typescript
import { createAuthClient } from "better-auth/client"

function createAuthClient<Option extends ClientOptions>(options?: Option)
```

**Description:** Creates a type-safe authentication client with dynamic API proxy and framework-specific integrations.

**Key Features:**
- Dynamic API proxy for authentication endpoints
- Type-safe session management
- Plugin system for extensibility
- Framework-specific hooks/composables

### ClientOptions
**Import Path:** `better-auth/client`

```typescript
interface ClientOptions {
  fetchOptions?: BetterFetchOption;
  plugins?: BetterAuthClientPlugin[];
  baseURL?: string;
  basePath?: string;
  disableDefaultFetchPlugins?: boolean;
  $InferAuth?: BetterAuthOptions;
}
```

## Framework Integrations

### React Integration
**Import Path:** `better-auth/client/react`

```typescript
import { createAuthClient } from "better-auth/client/react"

function createAuthClient<Option extends ClientOptions>(options?: Option)
```

**React-Specific Features:**
- `useSession()` - React hook for session state
- `useStore(atom)` - React hook for atom state management
- Returns React hooks for all plugin atoms (e.g., `useUser()`, `useOrganization()`)

**useSession Hook:**
```typescript
function useSession(): {
  data: Session;
  isPending: boolean;
  error: BetterFetchError | null;
  refetch: () => void;
}
```

### Vue Integration
**Import Path:** `better-auth/client/vue`

```typescript
import { createAuthClient } from "better-auth/client/vue"

function createAuthClient<Option extends ClientOptions>(options?: Option)
```

**Vue-Specific Features:**
- `useSession()` - Vue composable for session state with SSR support
- `useStore(atom)` - Vue composable for atom state management
- Returns Vue composables for all plugin atoms
- Supports both client-side and SSR with `useFetch` parameter

**useSession Composable:**
```typescript
// Client-side usage
function useSession(): DeepReadonly<Ref<{
  data: Session;
  isPending: boolean;
  isRefetching: boolean;
  error: BetterFetchError | null;
}>>

// SSR usage (e.g., with Nuxt)
function useSession<F extends (...args: any) => any>(
  useFetch: F,
): Promise<{
  data: Ref<Session>;
  isPending: false;
  error: Ref<{ message?: string; status: number; statusText: string; }>;
}>
```

### Svelte Integration
**Import Path:** `better-auth/client/svelte`

```typescript
import { createAuthClient } from "better-auth/client/svelte"

function createAuthClient<Option extends ClientOptions>(options?: Option)
```

**Svelte-Specific Features:**
- `useSession()` - Returns Svelte store for session state
- Direct access to nanostores atoms
- Returns Svelte stores for all plugin atoms

**useSession Store:**
```typescript
function useSession(): Atom<{
  data: Session;
  error: BetterFetchError | null;
  isPending: boolean;
  isRefetching: boolean;
}>
```

## Core API Methods

All client instances provide these core authentication methods through dynamic proxy:

### Session Management
```typescript
client.getSession() // GET /get-session
client.signOut() // POST /sign-out
```

### Authentication
```typescript
client.signIn.email(data) // POST /sign-in/email
client.signIn.username(data) // POST /sign-in/username
client.signUp.email(data) // POST /sign-up/email
```

### Password Management
```typescript
client.forgetPassword(data) // POST /forget-password
client.resetPassword(data) // POST /reset-password
client.changePassword(data) // POST /change-password
```


# Plugins System

## Plugin System Overview

Better Auth uses a plugin-based architecture that allows you to extend authentication functionality. Plugins are configured in the `betterAuth()` constructor and provide additional endpoints, middleware, database schema, and hooks.

### Plugin Structure

```typescript
interface BetterAuthPlugin {
  id: string;
  init?: (ctx: AuthContext) => void;
  endpoints?: { [key: string]: Endpoint };
  middlewares?: { path: string; middleware: Middleware }[];
  hooks?: { before?: Hook[]; after?: Hook[] };
  schema?: AuthPluginSchema;
  options?: Record<string, any>;
  rateLimit?: RateLimitRule[];
  $ERROR_CODES?: Record<string, string>;
}
```

## Core Plugins

### 1. Organization Plugin

**Import Path:** `better-auth/plugins/organization`

**Main Function:** `organization(options?: OrganizationOptions)`

#### Configuration Options

```typescript
interface OrganizationOptions {
  allowUserToCreateOrganization?: boolean | ((user: User) => Promise<boolean>);
  organizationLimit?: number | ((user: User) => Promise<boolean>);
  creatorRole?: string; // default: "owner"
  membershipLimit?: number; // default: 100
  ac?: AccessControl; // Access control configuration
  roles?: { [key: string]: Role };
  teams?: { enabled: boolean };
  schema?: InferOptionSchema<typeof organizationSchema>;
}
```

#### Key Endpoints

- `createOrganization` - Create a new organization
- `updateOrganization` - Update organization details
- `deleteOrganization` - Delete an organization
- `setActiveOrganization` - Set user's active organization
- `getFullOrganization` - Get complete organization data
- `listOrganizations` - List user's organizations
- `createInvitation` - Create organization invitation
- `acceptInvitation` - Accept organization invitation
- `addMember` - Add member to organization
- `removeMember` - Remove member from organization
- `updateMemberRole` - Update member's role
- `hasPermission` - Check user permissions
- `createTeam` - Create team (if teams enabled)
- `listOrganizationTeams` - List organization teams

#### Usage Example

```typescript
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";

const auth = betterAuth({
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      teams: { enabled: true }
    })
  ]
});
```

### 2. Two-Factor Authentication Plugin

**Import Path:** `better-auth/plugins/two-factor`

**Main Function:** `twoFactor(options?: TwoFactorOptions)`

#### Configuration Options

```typescript
interface TwoFactorOptions {
  issuer?: string; // Application name for TOTP
  totpOptions?: TOTPOptions;
  otpOptions?: OTPOptions;
  backupCodeOptions?: BackupCodeOptions;
  skipVerificationOnEnable?: boolean; // default: false
  schema?: InferOptionSchema<typeof twoFactorSchema>;
}
```

#### Key Endpoints

- `enableTwoFactor` - Enable 2FA for user (returns TOTP URI and backup codes)
- `disableTwoFactor` - Disable 2FA for user
- `verifyTotp` - Verify TOTP code
- `generateBackupCodes` - Generate new backup codes
- `verifyBackupCode` - Verify backup code
- `sendOtp` - Send OTP via configured method
- `verifyOtp` - Verify OTP code

#### Usage Example

```typescript
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";

const auth = betterAuth({
  plugins: [
    twoFactor({
      issuer: "MyApp",
      totpOptions: {
        digits: 6,
        period: 30
      }
    })
  ]
});
```

### 3. API Key Plugin

**Import Path:** `better-auth/plugins/api-key`

**Main Function:** `apiKey(options?: ApiKeyOptions)`

#### Configuration Options

```typescript
interface ApiKeyOptions {
  apiKeyHeaders?: string | string[]; // default: "x-api-key"
  disableKeyHashing?: boolean; // default: false
  customAPIKeyGetter?: (ctx: GenericEndpointContext) => string | null;
  customAPIKeyValidator?: (options: { ctx: GenericEndpointContext; key: string }) => boolean;
  customKeyGenerator?: (options: { length: number; prefix?: string }) => Promise<string>;
  defaultKeyLength?: number; // default: 64
  maximumPrefixLength?: number; // default: 32
  minimumPrefixLength?: number; // default: 1
  enableMetadata?: boolean; // default: false
  requireName?: boolean; // default: false
  rateLimit?: {
    enabled?: boolean; // default: true
    timeWindow?: number; // default: 24 hours
    maxRequests?: number; // default: 10
  };
  keyExpiration?: {
    defaultExpiresIn?: number | null;
    disableCustomExpiresTime?: boolean;
    maxExpiresIn?: number; // default: 365 days
    minExpiresIn?: number; // default: 1 day
  };
  disableSessionForAPIKeys?: boolean; // default: false
}
```

#### Key Endpoints

- `createApiKey` - Create new API key
- `verifyApiKey` - Verify API key validity
- `getApiKey` - Get API key details
- `updateApiKey` - Update API key properties
- `deleteApiKey` - Delete API key
- `listApiKeys` - List user's API keys

#### Usage Example

```typescript
import { betterAuth } from "better-auth";
import { apiKey } from "better-auth/plugins/api-key";

const auth = betterAuth({
  plugins: [
    apiKey({
      apiKeyHeaders: ["x-api-key", "authorization"],
      enableMetadata: true,
      requireName: true,
      rateLimit: {
        enabled: true,
        maxRequests: 100
      }
    })
  ]
});
```

## Additional Plugins

### Username Plugin

**Import Path:** `better-auth/plugins/username`

Adds username-based authentication support.

```typescript
username({
  minUsernameLength: 3,
  maxUsernameLength: 30,
  usernameValidator: (username: string) => /^[a-zA-Z0-9_.]+$/.test(username)
})
```

### Magic Link Plugin

**Import Path:** `better-auth/plugins/magic-link`

Enables passwordless authentication via email links.

```typescript
magicLink({
  expiresIn: 300, // 5 minutes
  sendMagicLink: async ({ email, url, token }) => {
    // Send email implementation
  },
  disableSignUp: false
})
```

### Admin Plugin

**Import Path:** `better-auth/plugins/admin`

Provides user management and impersonation capabilities.

```typescript
admin({
  defaultRole: "user",
  adminRoles: ["admin", "super-admin"],
  impersonationSessionDuration: 60 * 60 * 24 // 24 hours
})
```

### Other Available Plugins

- **Bearer Token Plugin:** `better-auth/plugins/bearer` - Adds bearer token authentication support for API access
- **JWT Plugin:** `better-auth/plugins/jwt` - Enables JWT token generation and validation
- **Multi-Session Plugin:** `better-auth/plugins/multi-session` - Allows users to have multiple active sessions
- **Anonymous Plugin:** `better-auth/plugins/anonymous` - Enables anonymous user sessions
- **Phone Number Plugin:** `better-auth/plugins/phone-number` - Adds phone number authentication support
- **Email OTP Plugin:** `better-auth/plugins/email-otp` - Provides email-based OTP authentication


# Adapters and Integrations

## Database Adapters

### Drizzle Adapter

**Import Path:** `better-auth/adapters/drizzle-adapter`

**Main Function:** `drizzleAdapter(db: DB, config: DrizzleAdapterConfig)`

**Configuration Options:**
```typescript
interface DrizzleAdapterConfig {
  /** The schema object that defines the tables and fields */
  schema?: Record<string, any>;
  /** The database provider */
  provider: "pg" | "mysql" | "sqlite";
  /** If the table names in the schema are plural */
  usePlural?: boolean;
  /** Enable debug logs for the adapter */
  debugLogs?: AdapterDebugLogs;
}
```

**Description:** Provides database integration for Drizzle ORM with support for PostgreSQL, MySQL, and SQLite. Handles CRUD operations, query building, and schema validation.

**Key Features:**
- Cross-database provider support
- Automatic query building with where clauses
- Schema validation and error handling
- Support for complex queries with operators (in, contains, starts_with, ends_with, lt, lte, gt, gte, ne)

### Prisma Adapter

**Import Path:** `better-auth/adapters/prisma-adapter`

**Main Function:** `prismaAdapter(prisma: PrismaClient, config: PrismaConfig)`

**Configuration Options:**
```typescript
interface PrismaConfig {
  /** Database provider */
  provider: "sqlite" | "cockroachdb" | "mysql" | "postgresql" | "sqlserver" | "mongodb";
  /** Enable debug logs for the adapter */
  debugLogs?: AdapterDebugLogs;
  /** Use plural table names */
  usePlural?: boolean;
}
```

**Description:** Provides database integration for Prisma ORM with support for multiple database providers including MongoDB.

**Key Features:**
- Multi-database provider support
- Automatic query conversion from better-auth format to Prisma format
- Built-in error handling for missing models
- Support for complex where clauses and sorting

### Other Available Adapters

- **Kysely Adapter:** `better-auth/adapters/kysely-adapter`
- **MongoDB Adapter:** `better-auth/adapters/mongodb-adapter`  
- **Memory Adapter:** `better-auth/adapters/memory-adapter`

## Framework Integrations

### Next.js Integration

**Import Path:** `better-auth/integrations/next-js`

**Main Functions:**
```typescript
// Convert auth handler to Next.js API route format
function toNextJsHandler(auth: { handler: (request: Request) => Promise<Response> } | ((request: Request) => Promise<Response>)): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}

// Next.js cookies plugin for server-side cookie handling
function nextCookies(): BetterAuthPlugin
```

**Description:** Provides seamless integration with Next.js applications, handling both API routes and server-side cookie management.

**Key Features:**
- Automatic GET/POST handler creation
- Server-side cookie parsing and setting
- Integration with Next.js headers API
- Support for App Router and Pages Router

### SvelteKit Integration

**Import Path:** `better-auth/integrations/svelte-kit`

**Main Functions:**
```typescript
// Convert auth handler to SvelteKit format
function toSvelteKitHandler(auth: { handler: (request: Request) => any; options: BetterAuthOptions }): (event: { request: Request }) => any

// SvelteKit request handler with build-time detection
function svelteKitHandler({ auth, event, resolve }: {
  auth: { handler: (request: Request) => any; options: BetterAuthOptions };
  event: { request: Request; url: URL };
  resolve: (event: any) => any;
}): Promise<any>

// Check if URL matches auth path
function isAuthPath(url: string, options: BetterAuthOptions): boolean
```

**Description:** Provides integration with SvelteKit applications with automatic build-time detection and request routing.

**Key Features:**
- Build-time detection to avoid runtime errors
- Automatic auth path detection
- Request/response handling for SvelteKit hooks
- URL-based routing logic

### Node.js Integration

**Import Path:** `better-auth/integrations/node`

**Main Functions:**
```typescript
// Convert auth handler to Node.js HTTP handler
function toNodeHandler(auth: { handler: Auth["handler"] } | Auth["handler"]): NodeHandler

// Convert Node.js headers to Web API Headers
function fromNodeHeaders(nodeHeaders: IncomingHttpHeaders): Headers
```

**Description:** Provides integration with Node.js HTTP servers and Express-like frameworks.

### React Start Integration

**Import Path:** `better-auth/integrations/react-start`

**Main Function:**
```typescript
// React Start cookies plugin
function reactStartCookies(): BetterAuthPlugin
```

**Description:** Provides cookie handling integration for React Start (TanStack Start) applications.

## Social Providers

**Import Path:** `better-auth/social-providers`

**Available Providers:**
```typescript
const socialProviders = {
  apple, discord, facebook, github, microsoft, google, 
  huggingface, spotify, twitch, twitter, dropbox, kick,
  linkedin, gitlab, tiktok, reddit, roblox, vk, zoom
}
```

### GitHub Provider

**Function:** `github(options: GithubOptions)`

**Configuration:**
```typescript
interface GithubOptions extends ProviderOptions<GithubProfile> {
  clientId: string;
  clientSecret: string;
  scope?: string[];
  disableDefaultScope?: boolean;
  // ... other OAuth options
}
```

**Default Scopes:** `["read:user", "user:email"]`

**Profile Fields:** Includes login, id, avatar_url, name, email, and comprehensive GitHub profile data.

### Google Provider

**Function:** `google(options: GoogleOptions)`

**Configuration:**
```typescript
interface GoogleOptions extends ProviderOptions<GoogleProfile> {
  clientId: string;
  clientSecret: string;
  accessType?: "offline" | "online";
  display?: "page" | "popup" | "touch" | "wap";
  hd?: string; // hosted domain
  // ... other OAuth options
}
```

**Default Scopes:** `["email", "profile", "openid"]`

**Profile Fields:** Includes sub, name, email, picture, email_verified, and OpenID Connect standard claims.

### Common Social Provider Features

All social providers support:
- OAuth 2.0 authorization code flow
- Token refresh capabilities
- Custom user profile mapping
- Scope customization
- Custom getUserInfo implementations
- ID token verification (where applicable)

**Type Definitions:**
```typescript
type SocialProviders = {
  [K in SocialProviderList[number]]?: Prettify<
    Parameters<(typeof socialProviders)[K]>[0] & {
      enabled?: boolean;
    }
  >;
};
```


# Additional Packages

## CLI Package

**Package:** `@better-auth/cli`  
**Import Path:** `@better-auth/cli`

Provides command-line tools for Better Auth development and management.

**Key Features:**
- Database migration generation
- Schema validation
- Configuration management
- Development utilities

## Expo Package

**Package:** `@better-auth/expo`  
**Import Path:** `@better-auth/expo`

Provides React Native/Expo-specific authentication client with native integrations.

**Key Features:**
- Native session storage
- Expo-specific OAuth handling
- React Native hooks
- Secure storage integration

## Stripe Package

**Package:** `@better-auth/stripe`  
**Import Path:** `@better-auth/stripe`

Provides Stripe integration for subscription and payment management.

**Key Features:**
- Subscription management
- Payment processing
- Webhook handling
- Customer management

# Usage Examples

## Complete Server Setup

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle-adapter";
import { organization, twoFactor, apiKey } from "better-auth/plugins";
import { github, google } from "better-auth/social-providers";

const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: mySchema,
    usePlural: false
  }),
  
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      // Send password reset email
    }
  },
  
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Send verification email
    },
    sendOnSignUp: true
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24      // 24 hours
  },
  
  socialProviders: {
    github: github({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET
    }),
    google: google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      accessType: "offline"
    })
  },
  
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      teams: { enabled: true }
    }),
    twoFactor({
      issuer: "MyApp",
      totpOptions: {
        digits: 6,
        period: 30
      }
    }),
    apiKey({
      enableMetadata: true,
      requireName: true
    })
  ]
});

export { auth };
```

## Complete Client Setup

```typescript
import { createAuthClient } from "better-auth/client/react";
import { organizationClient, twoFactorClient, apiKeyClient } from "better-auth/client/plugins";

const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [
    organizationClient(),
    twoFactorClient(),
    apiKeyClient()
  ]
});

// Usage in React component
function MyComponent() {
  const { data: session, isPending } = authClient.useSession();
  const { data: organizations } = authClient.useOrganizations();
  
  const handleSignIn = async () => {
    try {
      await authClient.signIn.email({
        email: "user@example.com",
        password: "password123"
      });
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };
  
  const handleSignOut = async () => {
    await authClient.signOut();
  };
  
  if (isPending) return <div>Loading...</div>;
  
  return (
    <div>
      {session ? (
        <div>
          <p>Welcome, {session.user.name}!</p>
          <button onClick={handleSignOut}>Sign Out</button>
        </div>
      ) : (
        <button onClick={handleSignIn}>Sign In</button>
      )}
    </div>
  );
}
```

## Framework Integration Examples

### Next.js App Router

```typescript
// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/integrations/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### SvelteKit

```typescript
// src/hooks.server.ts
import { auth } from "$lib/auth";
import { svelteKitHandler } from "better-auth/integrations/svelte-kit";

export const handle = ({ event, resolve }) => 
  svelteKitHandler({ auth, event, resolve });
```

### Express.js

```typescript
import express from "express";
import { auth } from "./auth";
import { toNodeHandler } from "better-auth/integrations/node";

const app = express();

app.use("/api/auth/*", toNodeHandler(auth));

app.listen(3000);
```

# Error Handling

## Server-Side Error Codes

```typescript
// Access error codes from auth instance
const errorCodes = auth.$ERROR_CODES;

// Common error codes
const {
  INVALID_EMAIL_OR_PASSWORD,
  USER_NOT_FOUND,
  EMAIL_ALREADY_EXISTS,
  INVALID_SESSION,
  RATE_LIMIT_EXCEEDED
} = errorCodes;
```

## Client-Side Error Handling

```typescript
import { BetterFetchError } from "better-auth/client";

try {
  await authClient.signIn.email({ email, password });
} catch (error) {
  if (error instanceof BetterFetchError) {
    switch (error.status) {
      case 400:
        console.log("Invalid credentials");
        break;
      case 429:
        console.log("Rate limit exceeded");
        break;
      default:
        console.log("Authentication failed:", error.message);
    }
  }
}
```

# Type Safety

Better Auth provides comprehensive TypeScript support with automatic type inference:

```typescript
// Server-side type inference
type InferredUser = InferUser<typeof auth>;
type InferredSession = InferSession<typeof auth>;

// Client-side type inference
type ClientAPI = InferClientAPI<typeof authClient>;
type SessionData = InferSessionFromClient<typeof authClient>;

// Plugin type inference
type OrganizationTypes = InferPluginTypes<typeof organizationPlugin>;
```

This comprehensive API reference covers all major aspects of Better Auth, providing you with the information needed to implement authentication in your TypeScript applications across different frameworks and use cases.

