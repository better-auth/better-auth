import { createAuthClient } from "better-auth/react";

export const { useSession, signIn, signOut, signUp } = createAuthClient({
  baseURL: "http://localhost:3000",
});
