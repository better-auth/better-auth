import { createAuthClient } from "better-auth/react";
import { auth } from "./auth";

export const authClient = createAuthClient<typeof auth>({
	baseURL: "http://localhost:3000/api/auth",
});

export const {
	useSession,
	useActiveOrganization,
	useInvitation,
	useListOrganization,
} = authClient;
