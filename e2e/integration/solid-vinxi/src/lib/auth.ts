import { betterAuth } from "better-auth";
import { database } from "better-auth/adapters";

export const auth = betterAuth({
  database: database({
    provider: "sqlite",
    url: "./dev.db",
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: ["http://localhost:3000"],
});