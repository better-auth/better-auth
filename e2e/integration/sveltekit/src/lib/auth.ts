import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";

const database = {
	user: [],
	session: [],
	account: [],
	verification: [],
};

export const auth = betterAuth({
	baseURL: {
		allowedHosts: ["localhost:*"],
		protocol: "http",
	},
	database: memoryAdapter(database),
	secret: "better-auth-sveltekit-test-secret",
	emailAndPassword: {
		enabled: true,
	},
	plugins: [sveltekitCookies(getRequestEvent)],
});
