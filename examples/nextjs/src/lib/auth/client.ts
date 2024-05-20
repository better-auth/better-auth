import { createAuthClient } from "@better-auth/client";
import type { auth } from "./server";

export const client = createAuthClient<typeof auth>()({
	baseURL: "",
});
