import { z } from "zod";
import { createAuthEndpoint } from "../../api";
import type { BetterAuthPlugin } from "../../types";

export const admin = ({
	trustedOrigins,
}: {
	trustedOrigins?: string[];
}) => {
	return {
		id: "admin",
		endpoints: {
			getAllUsers: createAuthEndpoint(
				"/user",
				{
					method: "GET",
				},
				async () => {
					return [];
				},
			),
			signIn: createAuthEndpoint(
				"/admin/sign-in",
				{
					method: "POST",
					body: z.object({
						email: z.string().email(),
						password: z.string(),
					}),
				},
				async () => {},
			),
		},
	} satisfies BetterAuthPlugin;
};

//next js fetch -> baseURL -> fetch("/users")
