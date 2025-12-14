# Better Auth Passkey Plugin

## Installation

```bash
# Using npm
npm install better-auth @better-auth/passkey

# Using yarn
yarn add better-auth @better-auth/passkey

# Using pnpm
pnpm add better-auth @better-auth/passkey

# Using bun
bun add better-auth @better-auth/passkey
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

For more information, visit the [Better Auth Passkey documentation](https://better-auth.com/docs/plugins/passkey).

## License

MIT