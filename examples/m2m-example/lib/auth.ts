import { createAuth } from "better-auth";
import { libsqlAdapter } from "better-auth/adapters/libsql";
import { m2m } from "better-auth/plugins/m2m";

export const auth = createAuth({
  adapter: libsqlAdapter({
    url: process.env.DATABASE_URL || "file:./auth.db",
  }),
  plugins: [
    m2m({
      enableMetadata: true,
      requireClientName: true,
      clientExpiration: {
        defaultExpiresIn: 365, // Default 1 year expiration
        maxExpiresIn: 730, // Maximum 2 years
        minExpiresIn: 1, // Minimum 1 day
      },
      rateLimit: {
        enabled: true,
        timeWindow: 24 * 60 * 60 * 1000, // 24 hours
        maxRequests: 1000, // 1000 requests per day
      },
      accessTokenExpiresIn: 3600, // 1 hour
      refreshTokenExpiresIn: 2592000, // 30 days
    }),
  ],
}); 