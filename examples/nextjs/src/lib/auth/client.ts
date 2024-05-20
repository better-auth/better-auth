import { createAuthClient } from "@better-auth/client";
import type { auth } from "./server";

export const client = createAuthClient<typeof auth>()({
	baseURL: "http://localhost:3000/api/auth",
});
