/// <reference types="vite/client" />
export * from "better-auth/client/plugins";

import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BASE_URL || "http://localhost:3000",
	plugins: [],
});
