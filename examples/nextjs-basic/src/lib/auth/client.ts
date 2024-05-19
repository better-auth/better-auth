import { createAuthClient } from "better-auth/client";
import type { Auth, org } from "./server";
import { betterOrgClient } from "@better-auth/organization/client";

export const auth = createAuthClient<Auth>()({
	baseURL: "http://localhost:3000/api/auth",
	plugins: [betterOrgClient<typeof org>()],
});
