import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

const database = {
	user: [],
	session: [],
	account: [],
	verification: [],
};

export const auth = betterAuth({
	baseURL: {
		allowedHosts: ["127.0.0.1:*"],
		protocol: "http",
	},
	database: memoryAdapter(database),
	secret: "better-auth-nuxt-test-secret",
	emailAndPassword: {
		enabled: true,
	},
});
