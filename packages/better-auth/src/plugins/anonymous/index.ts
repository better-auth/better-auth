import { createAuthEndpoint, sessionMiddleware } from "../../api";
import { alphabet, generateRandomString } from "../../crypto/random";
import type { BetterAuthPlugin } from "../../types";
import { setSessionCookie } from "../../utils/cookies";
import { z } from "zod";
export const anonymous = () => {
  return {
    id: "anonymous",
    endpoints: {
      signInAnon: createAuthEndpoint(
        "/sign-in/anonymous",
        {
          method: "POST",
        },
        async (ctx) => {
          const tempEmail =
            "temporary-" + Date.now().toString() + "-better-auth@email.com";
          const newUser = await ctx.context.internalAdapter.createUser({
            id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
            email: tempEmail,
            emailVerified: false,
            name: "",
            image: "",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          if (!newUser) {
            return ctx.json(null, {
              status: 500,
              body: {
                message: "Failed to create user",
                status: 500,
              },
            });
          }
          const session = await ctx.context.internalAdapter.createSession(
            newUser.id,
            ctx.request
          );
          if (!session) {
            return ctx.json(null, {
              status: 400,
              body: {
                message: "Could not create session",
              },
            });
          }
          await setSessionCookie(ctx, session.id);
          return ctx.json({ user: newUser, session });
        }
      ),
      linkAnon: createAuthEndpoint(
        "/user/link-anonymous",
        {
          method: "POST",
          body: z.object({
            email: z.string().email().optional(),
            password: z.string().min(6),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const { email, password } = ctx.body;
          let updatedUser = null;
          // handling both the email - password and updating the user
          if (email && password) {
            updatedUser = await ctx.context.internalAdapter.updateUser(userId, {
              email: email,
            });
          }
          if (!updatedUser) {
            return ctx.json(null, {
              status: 500,
              body: {
                message: "Failed to update user",
                status: 500,
              },
            });
          }
          const hash = await ctx.context.password.hash(password);
          const updateUserAccount =
            await ctx.context.internalAdapter.linkAccount({
              id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
              userId: updatedUser.id,
              providerId: "credential",
              password: hash,
              accountId: updatedUser.id,
            });
          if (!updateUserAccount) {
            return ctx.json(null, {
              status: 500,
              body: {
                message: "Failed to update account",
                status: 500,
              },
            });
          }
          const session = await ctx.context.internalAdapter.createSession(
            updatedUser.id,
            ctx.request
          );
          if (!session) {
            return ctx.json(null, {
              status: 400,
              body: {
                message: "Could not create session",
              },
            });
          }
          await setSessionCookie(ctx, session.id);
          return ctx.json({ session, user: updatedUser });
        }
      ),
    },
    schema: {
      user: {
        fields: {
          isAnonymous: {
            type: "boolean",
            defaultValue: true,
            required: false,
          },
        },
      },
    },
  } satisfies BetterAuthPlugin;
};
