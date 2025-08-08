---
title: TypeScript
description: Better Auth TypeScript integration.
---

Better Auth is designed to be type-safe. Both the client and server are built with TypeScript, allowing you to easily infer types.


## TypeScript Config

### Strict Mode

Better Auth is designed to work with TypeScript's strict mode. We recommend enabling strict mode in your TypeScript config file:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "strict": true
  }
}
```

if you can't set `strict` to `true`, you can enable `strictNullChecks`:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "strictNullChecks": true,
  }
}
```

<Callout type="warn">
If you're running into issues with TypeScript inference exceeding maximum length the compiler will serialize,
then please make sure you're following the instructions above, as well as ensuring that both `declaration` and `composite` are not enabled.
</Callout>

## Inferring Types

Both the client SDK and the server offer types that can be inferred using the `$Infer` property. Plugins can extend base types like `User` and `Session`, and you can use `$Infer` to infer these types. Additionally, plugins can provide extra types that can also be inferred through `$Infer`.

```ts title="auth-client.ts" 
import { createAuthClient } from "better-auth/client"

const authClient = createAuthClient()

export type Session = typeof authClient.$Infer.Session
```

The `Session` type includes both `session` and `user` properties. The user property represents the user object type, and the `session` property represents the `session` object type.

You can also infer types on the server side.

```ts title="auth.ts" 
import { betterAuth } from "better-auth"
import Database from "better-sqlite3"

export const auth = betterAuth({
    database: new Database("database.db")
})

type Session = typeof auth.$Infer.Session
```


## Additional Fields

Better Auth allows you to add additional fields to the user and session objects. All additional fields are properly inferred and available on the server and client side.

```ts 
import { betterAuth } from "better-auth"
import Database from "better-sqlite3"

export const auth = betterAuth({
    database: new Database("database.db"),
    user: {
       additionalFields: {
          role: {
              type: "string",
              input: false
            } 
        }
    }
   
})

type Session = typeof auth.$Infer.Session
```

In the example above, we added a `role` field to the user object. This field is now available on the `Session` type.


### The `input` property

The `input` property in an additional field configuration determines whether the field should be included in the user input. This property defaults to `true`, meaning the field will be part of the user input during operations like registration.

To prevent a field from being part of the user input, you must explicitly set `input: false`:

```ts
additionalFields: {
    role: {
        type: "string",
        input: false
    }
}
```

When `input` is set to `false`, the field will be excluded from user input, preventing users from passing a value for it.

By default, additional fields are included in the user input, which can lead to security vulnerabilities if not handled carefully. For fields that should not be set by the user, like a `role`, it is crucial to set `input: false` in the configuration.

### Inferring Additional Fields on Client

To make sure proper type inference for additional fields on the client side, you need to inform the client about these fields. There are two approaches to achieve this, depending on your project structure:

1. For Monorepo or Single-Project Setups

If your server and client code reside in the same project, you can use the `inferAdditionalFields` plugin to automatically infer the additional fields from your server configuration.

```ts
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
```

2. For Separate Client-Server Projects

If your client and server are in separate projects, you'll need to manually specify the additional fields when creating the auth client.

```ts
import { inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({
      user: {
        role: {
          type: "string"
        }
      }
  })],
});
```
