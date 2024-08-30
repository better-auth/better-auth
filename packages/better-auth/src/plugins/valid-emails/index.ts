import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-call";
import { z } from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";

export const validEmail = () => {
	return {
		id: "valid-emails",
		endpoints: {
			checkValidEmail: createAuthEndpoint(
				"/check-valid-email",
				{
					method: "POST",
					body: z.object({
						email: z.string().email(),
					}),
				},
				async (c) => {},
			),
		},
		hooks: {
			before: [
				{
					matcher(context) {
						return context.path === "/sign-up/credential";
					},
					handler: createAuthMiddleware(
						{
							body: z.object({
								email: z.string().email(),
							}),
						},
						async (c) => {
							//https://verifier.meetchopra.com/
							const { email } = c.body;
							const verify = await betterFetch<{
								status: boolean;
								email: string;
								domain: string;
							}>("https://verifyright.co/verify/:email", {
								params: {
									email,
								},
								query: {
									token:
										"92928b756e623357b3bd80e8dc90deae98f24350e18515289107d7f42a36096247086687ec104b8c9c432de706ba66ab",
								},
							});
							if (verify.error || !verify.data.status) {
								throw new APIError("BAD_REQUEST", {
									message: "Email is not valid",
								});
							}
						},
					),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
