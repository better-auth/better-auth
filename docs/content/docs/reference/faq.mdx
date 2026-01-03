---
title: FAQ
description: Frequently asked questions about Better Auth.
---

This page contains frequently asked questions, common issues, and other helpful information about Better Auth.

<Accordions>
  <Accordion title="Auth client not working">
  When encountering `createAuthClient` related errors, make sure to have the correct import path as it varies based on environment.

If you're using the auth client on react front-end, you'll need to import it from `/react`:

```ts title="component.ts"
import { createAuthClient } from "better-auth/react";
```

Where as if you're using the auth client in Next.js middleware, server-actions, server-components or anything server-related, you'll likely need to import it from `/client`:

```ts title="server.ts"
import { createAuthClient } from "better-auth/client";
```

</Accordion>

<Accordion title="getSession not working">
If you try to call `authClient.getSession` on a server environment (e.g, a Next.js server component), it doesn't work since it can't access the cookies. You can use the `auth.api.getSession` instead and pass the request headers to it. 

```tsx title="server.tsx"
import { auth } from "./auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({
    headers: await headers()
})
```

if you need to use the auth client on the server for different purposes, you still can pass the request headers to it:

```tsx title="server.tsx"
import { authClient } from "./auth-client";
import { headers } from "next/headers";

const session = await authClient.getSession({
    fetchOptions:{
      headers: await headers()
    }
})
```
</Accordion>

<Accordion title="Adding custom fields to the users table">

Better Auth provides a type-safe way to extend the user and session schemas, take a look at our docs on <Link href="/docs/concepts/database#extending-core-schema">extending core schema</Link>.

</Accordion>

<Accordion title="Difference between getSession and useSession">
Both `useSession` and `getSession` instances are used fundamentally different based on the situation.

`useSession` is a hook, meaning it can trigger re-renders whenever session data changes.

If you have UI you need to change based on user or session data, you can use this hook.

<Callout type="warn">
  For performance reasons, do not use this hook on your `layout.tsx` file. We
  recommend using RSC and use your server auth instance to get the session data
  via `auth.api.getSession`.
</Callout>

`getSession` returns a promise containing data and error.

For all other situations where you shouldn't use `useSession`, is when you should be using `getSession`.

<Callout type="info">
   `getSession` is available on both server and client auth instances.
   Not just the latter.
</Callout>
</Accordion>

<Accordion title="Common TypeScript Errors">
If you're facing typescript errors, make sure your tsconfig has `strict` set to `true`:
```json title="tsconfig.json"
{
  "compilerOptions": {
    "strict": true,
  }
}
```

if you can't set strict to true, you can enable strictNullChecks:
```json title="tsconfig.json"
{
  "compilerOptions": {
    "strictNullChecks": true,
  }
}
```

You can learn more in our <Link href="/docs/concepts/typescript#typescript-config">TypeScript docs</Link>.
</Accordion>
<Accordion title="Can I remove `name`, `image`, or `email` fields from the user table?">
At this time, you can't remove the `name`, `image`, or `email` fields from the user table.

We do plan to have more customizability in the future in this regard, but for now, you can't remove these fields.
</Accordion>
</Accordions>
