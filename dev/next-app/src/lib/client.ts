import { createReactAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createReactAuthClient<typeof auth>({
	baseURL: "http://localhost:3000/api/auth",
});
