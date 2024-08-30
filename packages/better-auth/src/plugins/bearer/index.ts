import { createAuthMiddleware } from "../../api/call";
import { BetterAuthError } from "../../error/better-auth-error";
import { BetterAuthPlugin } from "../../types/plugins";
import { serializeSigned } from "better-call";

/**
 * Converts bearer token to session cookie
 */
export const bearer = () => {
	return {
		id: "bearer",
		hooks: {
			before: [
				{
					matcher(context) {
						return (
							context.request?.headers
								.get("authorization")
								?.startsWith("Bearer ") || false
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const token = ctx.request?.headers
							.get("authorization")
							?.replace("Bearer ", "");
						if (!token) {
							throw new BetterAuthError("No token found");
						}
						const headers = ctx.headers || new Headers();
						const signedToken = await serializeSigned(
							"",
							token,
							ctx.context.secret,
						);
						headers.set(
							"cookie",
							`${
								ctx.context.authCookies.sessionToken.name
							}=${signedToken.replace("=", "")}`,
						);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
