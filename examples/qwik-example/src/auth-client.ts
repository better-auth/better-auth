import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
	baseURL: "http://localhost:5173",
	plugins: [],
});
