---
title: Nitro Integration
description: Integrate Better Auth with Nitro.
---

Better Auth can be integrated with your [Nitro Application](https://nitro.build/) (an open source framework to build web servers).

This guide aims to help you integrate Better Auth with your Nitro application in a few simple steps.

## Create a new Nitro Application

Start by scaffolding a new Nitro application using the following command:

```bash title="Terminal"
npx giget@latest nitro nitro-app --install
```

This will create the `nitro-app` directory and install all the dependencies. You can now open the `nitro-app` directory in your code editor.

### Prisma Adapter Setup

<Callout>
  This guide assumes that you have a basic understanding of Prisma. If you are new to Prisma, you can check out the [Prisma documentation](https://www.prisma.io/docs/getting-started).

  The `sqlite` database used in this guide will not work in a production environment. You should replace it with a production-ready database like `PostgreSQL`.
</Callout>

For this guide, we will be using the Prisma adapter. You can install prisma client by running the following command:

```package-install
@prisma/client
```

`prisma` can be installed as a dev dependency using the following command:

```package-install
-D prisma
```

Generate a `schema.prisma` file in the `prisma` directory by running the following command:

```bash title="Terminal"
npx prisma init
```

You can now replace the contents of the `schema.prisma` file with the following:

```prisma title="prisma/schema.prisma"
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// Will be deleted. Just need it to generate the prisma client
model Test {
  id   Int    @id @default(autoincrement())
  name String
}
```

Ensure that you update the `DATABASE_URL` in your `.env` file to point to the location of your database.

```txt title=".env"
DATABASE_URL="file:./dev.db"
```

Run the following command to generate the Prisma client & sync the database:

```bash title="Terminal"
npx prisma db push
```

### Install & Configure Better Auth

Follow steps 1 & 2 from the [installation guide](/docs/installation) to install Better Auth in your Nitro application & set up the environment variables.

Once that is done, create your Better Auth instance within the `server/utils/auth.ts` file.

```ts title="server/utils/auth.ts"
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
});
```

### Update Prisma Schema

Use the Better Auth CLI to update your Prisma schema with the required models by running the following command:

```bash title="Terminal"
npx @better-auth/cli generate --config server/utils/auth.ts
```

<Callout>
  The `--config` flag is used to specify the path to the file where you have created your Better Auth instance.
</Callout>

Head over to the `prisma/schema.prisma` file & save the file to trigger the format on save.

After saving the file, you can run the `npx prisma db push` command to update the database schema.

## Mount The Handler

You can now mount the Better Auth handler in your Nitro application. You can do this by adding the following code to your `server/routes/api/auth/[...all].ts` file:

```ts title="server/routes/api/auth/[...all].ts"
export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event));
});
```
<Callout>
  This is a [catch-all](https://nitro.build/guide/routing#catch-all-route) route that will handle all requests to `/api/auth/*`.
</Callout>

### CORS

You can configure CORS for your Nitro app by creating a plugin.

Start by installing the cors package:

```package-install
cors
```

You can now create a new file `server/plugins/cors.ts` and add the following code:

```ts title="server/plugins/cors.ts"
import cors from "cors";
export default defineNitroPlugin((plugin) => {
  plugin.h3App.use(
    fromNodeMiddleware(
      cors({
        origin: "*",
      }),
    ),
  );
});
```
<Callout>
  This will enable CORS for all routes. You can customize the `origin` property to allow requests from specific domains. Ensure that the config is in sync with your frontend application.
</Callout>

### Auth Guard/Middleware

You can add an auth guard to your Nitro application to protect routes that require authentication. You can do this by creating a new file `server/utils/require-auth.ts` and adding the following code:

```ts title="server/utils/require-auth.ts"
import { EventHandler, H3Event } from "h3";
import { fromNodeHeaders } from "better-auth/node";

/**
 * Middleware used to require authentication for a route.
 *
 * Can be extended to check for specific roles or permissions.
 */
export const requireAuth: EventHandler = async (event: H3Event) => {
  const headers = event.headers;

  const session = await auth.api.getSession({
    headers: headers,
  });
  if (!session)
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
  // You can save the session to the event context for later use
  event.context.auth = session;
};
```

You can now use this event handler/middleware in your routes to protect them:

```ts title="server/routes/api/secret.get.ts"
// Object syntax of the route handler
export default defineEventHandler({
  // The user has to be logged in to access this route
  onRequest: [requireAuth],
  handler: async (event) => {
    setResponseStatus(event, 201, "Secret data");
    return { message: "Secret data" };
  },
});
```

### Example

You can find an example of a Nitro application integrated with Better Auth & Prisma [here](https://github.com/BayBreezy/nitrojs-better-auth-prisma).
