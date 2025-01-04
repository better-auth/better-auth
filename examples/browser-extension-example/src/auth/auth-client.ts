import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: "http://localhost:3000" /* base url of your Better Auth backend. */,
	plugins: [],
});
