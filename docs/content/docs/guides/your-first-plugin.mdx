---
title: Create your first plugin
description: A step-by-step guide to creating your first Better Auth plugin.
---

In this guide, we’ll walk you through the steps of creating your first Better Auth plugin.


<Callout type="warn">
This guide assumes you have <Link href="/docs/installation">setup the basics</Link> of Better Auth and are ready to create your first plugin.
</Callout>

<Steps>
<Step>
## Plan your idea
Before beginning, you must know what plugin you intend to create.

In this guide, we’ll create a **birthday plugin** to keep track of user birth dates.
</Step>

<Step>
## Server plugin first
Better Auth plugins operate as a pair: a <Link href="/docs/concepts/plugins#create-a-server-plugin">server plugin</Link> and a <Link href="/docs/concepts/plugins#create-a-client-plugin">client plugin</Link>.
The server plugin forms the foundation of your authentication system, while the client plugin provides convenient frontend APIs to interact with your server implementation.


<Callout>
You can read more about server/client plugins in our <Link href="/docs/concepts/plugins#creating-a-plugin">documentation</Link>.
</Callout>

### Creating the server plugin
Go ahead and find a suitable location to create your birthday plugin folder, with an `index.ts` file within.
<Files>
  <Folder name="birthday-plugin" defaultOpen>
    <File name="index.ts" />
  </Folder>
</Files>
In the `index.ts` file, we’ll export a function that represents our server plugin.
This will be what we will later add to our plugin list in the `auth.ts` file.

```ts title="index.ts"
import { createAuthClient } from "better-auth/client";
import type { BetterAuthPlugin } from "better-auth";

export const birthdayPlugin = () =>
  ({
    id: "birthdayPlugin",
  } satisfies BetterAuthPlugin);

```
Although this does nothing, you have technically just made yourself your first plugin, congratulations! 🎉

</Step>

<Step>
### Defining a schema
In order to save each user’s birthday data, we must create a schema on top of the `user` model.

By creating a schema here, this also allows <Link href="/docs/concepts/cli">Better Auth’s CLI</Link> to generate the schemas required to update your database.

<Callout type="info">
You can learn more about <Link href="/docs/concepts/plugins#schema">plugin schemas here</Link>.
</Callout>

```ts title="index.ts"
//...
export const birthdayPlugin = () =>
  ({
    id: "birthdayPlugin",
    schema: {// [!code highlight]
      user: {// [!code highlight]
        fields: {// [!code highlight]
          birthday: {// [!code highlight]
            type: "date", // string, number, boolean, date // [!code highlight]
            required: true, // if the field should be required on a new record. (default: false) // [!code highlight]
            unique: false, // if the field should be unique. (default: false) // [!code highlight]
            references: null // if the field is a reference to another table. (default: null) // [!code highlight]
          },// [!code highlight]
        },// [!code highlight]
      },// [!code highlight]
    },
  } satisfies BetterAuthPlugin);
```

</Step>

<Step>
### Authorization logic
For this example guide, we’ll set up authentication logic to check and ensure that the user who signs-up is older than 5.
But the same concept could be applied for something like verifying users agreeing to the TOS or anything alike.

To do this, we’ll utilize <Link href="/docs/concepts/plugins#hooks">Hooks</Link>, which allows us to run code `before` or `after` an action is performed.

```ts title="index.ts"
export const birthdayPlugin = () => ({
    //...
    // In our case, we want to write authorization logic,
    // meaning we want to intercept it `before` hand.
    hooks: {
      before: [
        {
          matcher: (context) => /* ... */,
          handler: createAuthMiddleware(async (ctx) => {
            //...
          }),
        },
      ],
    },
} satisfies BetterAuthPlugin)
```

In our case we want to match any requests going to the signup path:
```ts title="Before hook"
{
  matcher: (context) => context.path.startsWith("/sign-up/email"),
  //...
}
```

And for our logic, we’ll write the following code to check the if user’s birthday makes them above 5 years old.
```ts title="Imports"
import { APIError } from "better-auth/api";
import { createAuthMiddleware } from "better-auth/plugins";
```
```ts title="Before hook"
{
  //...
  handler: createAuthMiddleware(async (ctx) => {
    const { birthday } = ctx.body;
    if(!(birthday instanceof Date)) {
      throw new APIError("BAD_REQUEST", { message: "Birthday must be of type Date." });
    }

    const today = new Date();
    const fiveYearsAgo = new Date(today.setFullYear(today.getFullYear() - 5));

    if(birthday >= fiveYearsAgo) {
      throw new APIError("BAD_REQUEST", { message: "User must be above 5 years old." });
    }

    return { context: ctx };
  }),
}
```

**Authorized!** 🔒

We’ve now successfully written code to ensure authorization for users above 5!

</Step>

<Step>
## Client Plugin
We’re close to the finish line! 🏁

Now that we have created our server plugin, the next step is to develop our client plugin.
Since there isn’t much frontend APIs going on for this plugin, there isn’t much to do!

First, let’s create our `client.ts` file first:
<Files>
  <Folder name="birthday-plugin" defaultOpen>
    <File name="index.ts" />
    <File name="client.ts" />
  </Folder>
</Files>
Then, add the following code:
```ts title="client.ts"
import { BetterAuthClientPlugin } from "better-auth";
import type { birthdayPlugin } from "./index"; // make sure to import the server plugin as a type // [!code highlight]

type BirthdayPlugin = typeof birthdayPlugin;

export const birthdayClientPlugin = () => {
  return {
    id: "birthdayPlugin",
    $InferServerPlugin: {} as ReturnType<BirthdayPlugin>,
  } satisfies BetterAuthClientPlugin;
};
```
What we’ve done is allow the client plugin to infer the types defined by our schema from the server plugin.

And that’s it!  This is all it takes for the birthday client plugin. 🎂

</Step>

<Step>
## Initiate your plugin!
Both the `client` and `server` plugins are now ready, the last step is to import them to both your `auth-client.ts` and your `server.ts` files respectively to initiate the plugin.

### Server initiation
```ts title="server.ts"
import { betterAuth } from "better-auth";
import { birthdayPlugin } from "./birthday-plugin";// [!code highlight]
 
export const auth = betterAuth({
    plugins: [
      birthdayPlugin(),// [!code highlight]
    ]
});
```

### Client initiation
```ts title="auth-client.ts"
import { createAuthClient } from "better-auth/client";
import { birthdayClientPlugin } from "./birthday-plugin/client";// [!code highlight]
 
const authClient = createAuthClient({
    plugins: [
      birthdayClientPlugin()// [!code highlight]
    ]
});
```

### Oh yeah, the schemas! 
Don’t forget to add your `birthday` field to your `user` table model! 

Or, use the `generate` <Link href="/docs/concepts/cli#generate">CLI command</Link>:
```bash
npx @better-auth/cli@latest generate
```

</Step>
</Steps>

## Wrapping Up

Congratulations! You’ve successfully created your first ever Better Auth plugin.
We highly recommend you visit our <Link href="/docs/concepts/plugins">plugins documentation</Link> to learn more information.

If you have a plugin you’d like to share with the community, feel free to let us know through 
our <Link href="https://discord.gg/better-auth">Discord server</Link>,
or through a <Link href="https://github.com/better-auth/better-auth/pulls">pull-request</Link>
and we may add it to the <Link href="/docs/plugins/community-plugins">community-plugins</Link> list!
