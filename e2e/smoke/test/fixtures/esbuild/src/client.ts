import { createAuthClient } from "better-auth/vue";

export * from "better-auth/client/plugins";

export const client = createAuthClient({
	baseURL: "http://localhost:3000",
});
