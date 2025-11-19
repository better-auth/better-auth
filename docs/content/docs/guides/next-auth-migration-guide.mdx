---
title: Migrating from Auth.js to Better Auth
description: A step-by-step guide to transitioning from Auth.js to Better Auth.
---

## Introduction

In this guide, we'll walk through the steps to migrate a project from [Auth.js](https://authjs.dev/) (formerly [NextAuth.js](https://next-auth.js.org/)) to Better Auth. Since these projects have different design philosophies, the migration requires careful planning and work. If your current setup is working well, there's no urgent need to migrate. We continue to handle security patches and critical issues for Auth.js.

However, if you're starting a new project or facing challenges with your current setup, we strongly recommend using Better Auth. Our roadmap includes features previously exclusive to Auth.js, and we hope this will unite the ecosystem more strongly without causing fragmentation.

<Steps>
<Step>
## Create Better Auth Instance

Before starting the migration process, set up Better Auth in your project. Follow the [installation guide](/docs/installation) to get started.

For example, if you use the GitHub OAuth provider, here is a comparison of the `auth.ts` file.

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
```ts 
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
  
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],
})
```
</Tab>

<Tab value="Better Auth">
```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  socialProviders: { 
    github: { 
      clientId: process.env.GITHUB_CLIENT_ID!, 
      clientSecret: process.env.GITHUB_CLIENT_SECRET!, 
    }, 
  }, 
})
```
</Tab>
</Tabs>

<Callout type="info">
Now Better Auth supports stateless session management without any database. If you were using a Database adapter in Auth.js, you can refer to the [Database models](#database-models) below to check the differences with Better Auth's core schema.
</Callout>
</Step>

<Step>
## Create Client Instance

This client instance includes a set of functions for interacting with the Better Auth server instance. For more information, see [here](/docs/concepts/client).

```ts title="auth-client.ts"
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()
```
</Step>

<Step>
## Update the Route Handler

Rename the `/app/api/auth/[...nextauth]` folder to `/app/api/auth/[...all]` to avoid confusion. Then, update the `route.ts` file as follows:

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
```ts 
import { handlers } from "@/lib/auth"

export const { GET, POST } = handlers
```
</Tab>

<Tab value="Better Auth">
```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth)
```
</Tab>
</Tabs>
</Step>

<Step>
## Session Management

In this section, we'll look at how to manage sessions in Better Auth compared to Auth.js. For more information, see [here](/docs/concepts/session-management).

### Client-side

#### Sign In

Here are the differences between Auth.js and Better Auth for signing in users. For example, with the GitHub OAuth provider:

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
```ts 
"use client"

import { signIn } from "next-auth/react"

signIn("github")
```
</Tab>

<Tab value="Better Auth">
```ts
"use client"

import { authClient } from "@/lib/auth-client";

const { data, error } = await authClient.signIn.social({
  provider: "github",
})
```
</Tab>
</Tabs>

#### Sign Out

Here are the differences between Auth.js and Better Auth when signing out users.

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
```ts 
"use client"

import { signOut } from "next-auth/react"

signOut()
```
</Tab>

<Tab value="Better Auth">
```ts
"use client"

import { authClient } from "@/lib/auth-client";

const { data, error } = await authClient.signOut()
```
</Tab>
</Tabs>

#### Get Session

Here are the differences between Auth.js and Better Auth for getting the current active session.

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
```ts 
"use client"

import { useSession } from "next-auth/react"

const { data, status, update } = useSession()
```
</Tab>

<Tab value="Better Auth">
```ts
"use client"

import { authClient } from "@/lib/auth-client";

const { data, error, refetch, isPending, isRefetching } = authClient.useSession()
```
</Tab>
</Tabs>

### Server-side

#### Sign In

Here are the differences between Auth.js and Better Auth for signing in users. For example, with the GitHub OAuth provider:

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
```ts 
import { signIn } from "@/lib/auth"

await signIn("github")
```
</Tab>

<Tab value="Better Auth">
```ts
import { auth } from "@/lib/auth";

const { redirect, url } = await auth.api.signInSocial({
  body: {
    provider: "github",
  },
})
```
</Tab>
</Tabs>

#### Sign Out

Here are the differences between Auth.js and Better Auth when signing out users.

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
```ts 
import { signOut } from "@/lib/auth"

await signOut()
```
</Tab>

<Tab value="Better Auth">
```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const { success } = await auth.api.signOut({
  headers: await headers(),
})
```
</Tab>
</Tabs>

#### Get Session

Here are the differences between Auth.js and Better Auth for getting the current active session.

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
```ts 
import { auth } from "@/lib/auth";

const session = await auth()
```
</Tab>

<Tab value="Better Auth">
```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({
  headers: await headers(),
})
```
</Tab>
</Tabs>
</Step>

<Step>
## Protecting Resources

> Proxy(Middleware) is not intended for slow data fetching. While Proxy can be helpful for optimistic checks such as permission-based redirects, it should not be used as a full session management or authorization solution. - [Next.js docs](https://nextjs.org/docs/app/getting-started/proxy#use-cases)

Auth.js offers approaches using Proxy (Middleware), but we recommend handling auth checks on each page or route rather than in a Proxy or Layout. Here is a basic example of protecting resources with Better Auth.

<Tabs items={["Client-side", "Server-side"]}>
<Tab value="Client-side">
```ts title="app/dashboard/page.tsx"
"use client";

import { authClient } from "@/lib/auth-client";
import { redirect } from "next/navigation";

const DashboardPage = () => {
  const { data, error, isPending } = authClient.useSession();

  if (isPending) {
    return <div>Pending</div>;
  }
  if (!data || error) {
    redirect("/sign-in");
  }

  return (
    <div>
      <h1>Welcome {data.user.name}</h1>
    </div>
  );
};

export default DashboardPage;
```
</Tab>

<Tab value="Server-side">
```ts title="app/dashboard/page.tsx"
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const DashboardPage = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div>
      <h1>Welcome {session.user.name}</h1>
    </div>
  );
};

export default DashboardPage;

```
</Tab>
</Tabs>
</Step>

<Step>
## Database models

Both Auth.js and Better Auth provide stateless (JWT) and database session strategies. If you were using the database session strategy in Auth.js and plan to continue using it in Better Auth, you will also need to migrate your database.

Just like Auth.js has database models, Better Auth also has a core schema. In this section, we'll compare the two and explore the differences between them.

### User -> User

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
<DatabaseTable
  fields={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for each user",
      isPrimaryKey: true,
    },
    {
      name: "name",
      type: "string",
      description: "User's chosen display name",
      isOptional: true,
    },
    {
      name: "email",
      type: "string",
      description: "User's email address for communication and login",
      isOptional: true,
    },
    {
      name: "emailVerified",
      type: "Date",
      description: "When the user's email was verified",
      isOptional: true,
    },
    {
      name: "image",
      type: "string",
      description: "User's image url",
      isOptional: true,
    },
  ]}
/>
</Tab>
<Tab value="Better Auth">
<DatabaseTable
  fields={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for each user",
      isPrimaryKey: true,
    },
    {
      name: "name",
      type: "string",
      description: "User's chosen display name",
    },
    {
      name: "email",
      type: "string",
      description: "User's email address for communication and login",
    },
    {
      name: "emailVerified",
      type: "boolean",
      description: "Whether the user's email is verified",
    },
    {
      name: "image",
      type: "string",
      description: "User's image url",
      isOptional: true,
    },
    {
      name: "createdAt",
      type: "Date",
      description: "Timestamp of when the user account was created",
    },
    {
      name: "updatedAt",
      type: "Date",
      description: "Timestamp of the last update to the user's information",
    },
  ]}
/>
</Tab>
</Tabs>

### Session -> Session

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
<DatabaseTable
  fields={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for each session",
      isPrimaryKey: true,
    },
    {
      name: "userId",
      type: "string",
      description: "The ID of the user",
      isForeignKey: true,
    },
    {
      name: "sessionToken",
      type: "string",
      description: "The unique session token",
    },
    {
      name: "expires",
      type: "Date",
      description: "The time when the session expires",
    },
  ]}
/>
</Tab>
<Tab value="Better Auth">
<DatabaseTable
  fields={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for each session",
      isPrimaryKey: true,
    },
    {
      name: "userId",
      type: "string",
      description: "The ID of the user",
      isForeignKey: true,
    },
    {
      name: "token",
      type: "string",
      description: "The unique session token",
      isUnique: true,
    },
    {
      name: "expiresAt",
      type: "Date",
      description: "The time when the session expires",
    },
    {
      name: "ipAddress",
      type: "string",
      description: "The IP address of the device",
      isOptional: true,
    },
    {
      name: "userAgent",
      type: "string",
      description: "The user agent information of the device",
      isOptional: true,
    },
    {
      name: "createdAt",
      type: "Date",
      description: "Timestamp of when the session was created",
    },
    {
      name: "updatedAt",
      type: "Date",
      description: "Timestamp of when the session was updated",
    },
  ]}
/>
</Tab>
</Tabs>

### Account -> Account

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
<DatabaseTable
  fields={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for each account",
      isPrimaryKey: true,
    },
    {
      name: "userId",
      type: "string",
      description: "The ID of the user",
      isForeignKey: true,
    },
    {
      name: "type",
      type: "string",
      description: "Type of the account (e.g. 'oauth', 'email', 'credentials')",
    },
    {
      name: "provider",
      type: "string",
      description: "Provider identifier",
    },
    {
      name: "providerAccountId",
      type: "string",
      description: "Account ID from the provider",
    },
    {
      name: "refresh_token",
      type: "string",
      description: "The refresh token of the account. Returned by the provider",
      isOptional: true,
    },
    {
      name: "access_token",
      type: "string",
      description: "The access token of the account. Returned by the provider",
      isOptional: true,
    },
    {
      name: "expires_at",
      type: "number",
      description: "The time when the access token expires",
      isOptional: true,
    },
    {
      name: "token_type",
      type: "string",
      description: "Type of the token",
      isOptional: true,
    },
    {
      name: "scope",
      type: "string",
      description: "The scope of the account. Returned by the provider",
      isOptional: true,
    },
    {
      name: "id_token",
      type: "string",
      description: "The ID token returned from the provider",
      isOptional: true,
    },
    {
      name: "session_state",
      type: "string",
      description: "OAuth session state",
      isOptional: true,
    },
  ]}
/>
</Tab>
<Tab value="Better Auth">
<DatabaseTable
  fields={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for each account",
      isPrimaryKey: true,
    },
    {
      name: "userId",
      type: "string",
      description: "The ID of the user",
      isForeignKey: true,
    },
    {
      name: "accountId",
      type: "string",
      description:
        "The ID of the account as provided by the SSO or equal to userId for credential accounts",
    },
    {
      name: "providerId",
      type: "string",
      description: "The ID of the provider",
    },
    {
      name: "accessToken",
      type: "string",
      description: "The access token of the account. Returned by the provider",
      isOptional: true,
    },
    {
      name: "refreshToken",
      type: "string",
      description: "The refresh token of the account. Returned by the provider",
      isOptional: true,
    },
    {
      name: "accessTokenExpiresAt",
      type: "Date",
      description: "The time when the access token expires",
      isOptional: true,
    },
    {
      name: "refreshTokenExpiresAt",
      type: "Date",
      description: "The time when the refresh token expires",
      isOptional: true,
    },
    {
      name: "scope",
      type: "string",
      description: "The scope of the account. Returned by the provider",
      isOptional: true,
    },
    {
      name: "idToken",
      type: "string",
      description: "The ID token returned from the provider",
      isOptional: true,
    },
    {
      name: "password",
      type: "string",
      description:
        "The password of the account. Mainly used for email and password authentication",
      isOptional: true,
    },
    {
      name: "createdAt",
      type: "Date",
      description: "Timestamp of when the account was created",
    },
    {
      name: "updatedAt",
      type: "Date",
      description: "Timestamp of when the account was updated",
    },
  ]}
/>
</Tab>
</Tabs>

### VerificationToken -> Verification

<Tabs items={["Auth.js", "Better Auth"]}>
<Tab value="Auth.js">
<DatabaseTable
  fields={[
    {
      name: "identifier",
      type: "string",
      description: "Identifier for the verification request",
      isPrimaryKey: true,
    },
    {
      name: "token",
      type: "string",
      description: "The verification token",
      isPrimaryKey: true,
    },
    {
      name: "expires",
      type: "Date",
      description: "The time when the verification token expires",
    },
  ]}
/>
</Tab>
<Tab value="Better Auth">
<DatabaseTable
  fields={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for each verification",
      isPrimaryKey: true,
    },
    {
      name: "identifier",
      type: "string",
      description: "The identifier for the verification request",
    },
    {
      name: "value",
      type: "string",
      description: "The value to be verified",
    },
    {
      name: "expiresAt",
      type: "Date",
      description: "The time when the verification request expires",
    },
    {
      name: "createdAt",
      type: "Date",
      description: "Timestamp of when the verification request was created",
    },
    {
      name: "updatedAt",
      type: "Date",
      description: "Timestamp of when the verification request was updated",
    },
  ]}
/>
</Tab>
</Tabs>

### Comparison

Table: <strong className='underline italic'>User</strong>
- `name`, `email`, and `emailVerified` are required in Better Auth, while optional in Auth.js
- `emailVerified` uses a boolean in Better Auth, while Auth.js uses a timestamp
- Better Auth includes `createdAt` and `updatedAt` timestamps

Table: <strong className='underline italic'>Session</strong>
- Better Auth uses `token` instead of `sessionToken`
- Better Auth uses `expiresAt` instead of `expires`
- Better Auth includes `ipAddress` and `userAgent` fields
- Better Auth includes `createdAt` and `updatedAt` timestamps

Table: <strong className='underline italic'>Account</strong>
- Better Auth uses camelCase naming (e.g. `refreshToken` vs `refresh_token`)
- Better Auth includes `accountId` to distinguish between the account ID and internal ID
- Better Auth uses `providerId` instead of `provider`
- Better Auth includes `accessTokenExpiresAt` and `refreshTokenExpiresAt` for token management
- Better Auth includes `password` field to support built-in credential authentication
- Better Auth does not have a `type` field as it's determined by the `providerId`
- Better Auth removes `token_type` and `session_state` fields
- Better Auth includes `createdAt` and `updatedAt` timestamps

Table: <strong className='underline italic'>VerificationToken -> Verification</strong>
- Better Auth uses `Verification` table instead of `VerificationToken`
- Better Auth uses a single `id` primary key instead of composite primary key
- Better Auth uses `value` instead of `token` to support various verification types
- Better Auth uses `expiresAt` instead of `expires`
- Better Auth includes `createdAt` and `updatedAt` timestamps

<Callout type="info">
If you were using Auth.js v4, note that v5 does not introduce any breaking changes to the database schema. Optional fields like `oauth_token_secret` and `oauth_token` can be removed if you are not using them. Rarely used fields like `refresh_token_expires_in` can also be removed.
</Callout>

### Customization

You may have extended the database models or implemented additional logic in Auth.js. Better Auth allows you to customize the core schema in a type-safe way. You can also define custom logic during the lifecycle of database operations. For more details, see [Concepts - Database](/docs/concepts/database). 
</Step>
</Steps>

## Wrapping Up

Now you're ready to migrate from Auth.js to Better Auth. For a complete implementation with multiple authentication methods, check out the [Next.js Demo App](https://github.com/better-auth/better-auth/tree/canary/demo/nextjs). Better Auth offers greater flexibility and more features, so be sure to explore the [documentation](/docs) to unlock its full potential.

If you need help with migration, join our [community](/community) or reach out to [contact@better-auth.com](mailto:contact@better-auth.com).