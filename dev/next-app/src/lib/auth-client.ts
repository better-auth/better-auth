import { createAuthClient } from "better-auth/react";
import { organization } from "better-auth/client";

export const authClient = createAuthClient({
	baseURL: "http://localhost:3000/api/auth",
	authPlugins: [organization],
});

export const {
	useSession,
	useActiveOrganization,
	useInvitation,
	useListOrganization,
} = authClient;
