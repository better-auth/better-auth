# Better Auth DBSC Plugin

Binds Better Auth sessions to the device that signed in, using Device Bound Session Credentials. A session cookie copied to another machine stops working there.

## Installation

```bash
npm install better-auth @better-auth/dbsc
```

## Usage

```ts
import { betterAuth } from "better-auth";
import { dbsc } from "@better-auth/dbsc";

export const auth = betterAuth({
	plugins: [dbsc()],
});
```

Then run `npx auth@latest migrate` to add the `session.dbscPublicKey` field.

See the [documentation](https://www.better-auth.com/docs/plugins/dbsc) for browser support, deployment requirements, and limits.
