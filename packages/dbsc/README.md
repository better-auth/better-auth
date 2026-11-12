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

Then migrate your database to add the `session.dbscPublicKey` field: run `npx auth@latest migrate` with the built-in database adapter, or `npx auth@latest generate` and your ORM's migration with Prisma or Drizzle.

See the [documentation](https://www.better-auth.com/docs/plugins/dbsc) for browser support, deployment requirements, and limits.
