import { expo } from "@better-auth/expo";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";

export const auth = betterAuth({
	database: drizzleAdapter({}, { provider: "sqlite" }),
	plugins: [expo()],
});
