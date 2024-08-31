import { createAuthClient } from "better-auth/svelte";
import { organization } from "better-auth/client";

export const client = createAuthClient({
	baseURL: "http://localhost:3000/api/auth",
	authPlugins: [organization],
});
