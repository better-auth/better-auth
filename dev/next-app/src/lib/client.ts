import { createAuthClient } from "better-auth/client";
import { auth } from "./auth";

export const authClient = createAuthClient<typeof auth>({
	baseURL: "http://localhost:3000/api/auth",
});

