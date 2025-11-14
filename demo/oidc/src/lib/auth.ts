import { betterAuth } from "better-auth";
import { oidcProvider } from "better-auth/plugins";
import Database from "better-sqlite3";

export const auth = betterAuth({
  database: new Database("./database.db"),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    oidcProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      allowDynamicClientRegistration: true,
    }),
  ],
});
