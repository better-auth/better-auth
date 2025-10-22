# @better-auth/passkey

Passkey plugin for Better Auth - WebAuthn authentication support.

## Installation

```bash
pnpm add @better-auth/passkey
```

## Usage

### Server

```typescript
import { betterAuth } from "better-auth";
import { passkey } from "@better-auth/passkey";

export const auth = betterAuth({
  plugins: [
    passkey({
      rpID: "example.com",
      rpName: "My App",
    }),
  ],
});
```

### Client

```typescript
import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});
```

## Documentation

For more information, visit the [Better Auth documentation](https://better-auth.com/docs/plugins/passkey).

## License

MIT
