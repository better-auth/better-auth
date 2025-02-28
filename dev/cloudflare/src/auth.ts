import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDrizzle } from "./db";

export const createAuth = (env: CloudflareBindings) =>
	betterAuth({
		database: drizzleAdapter(createDrizzle(env.DB), { provider: "sqlite" }),
		secret: "some-secret-value-here",
		emailAndPassword: {
			enabled: true,
		},
	});

export type Auth = ReturnType<typeof createAuth>;
