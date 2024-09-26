import { createAuthClient } from "better-auth/vue";

export const { signIn, signOut, signUp, useSession } = createAuthClient();
