---
title: Signup disabled
description: Signup disabled error
---

This error occurs when you disable sign up in your oauth provider config and a user tries to sign up with that provider.

## How to fix

If you're using the `disableSignUp` option with stateless mode, you will see this error. Please consider using database hooks instead to handle this case.

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";

export const auth = betterAuth({
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const isAllowedToSignUp = await isAllowedToSignUp(user, ctx); // [!code highlight] // check if the user is allowed to sign up
          if (!isAllowedToSignUp) {
            throw new APIError("BAD_REQUEST", {
              message: "Signup is disabled",
			});
          },
        },
      },
	},
  }
});
```