import { serializeSigned } from "better-call";
import type { BetterAuthPlugin } from "../../types/plugins";

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
						return Boolean(
							context.request?.headers.get("authorization") ||
								context.headers?.get("authorization"),
						);
					},
					handler: async (c) => {
						const token =
							c.request?.headers.get("authorization")?.replace("Bearer ", "") ||
							c.headers?.get("authorization")?.replace("Bearer ", "");
						if (!token) {
							return;
						}
						const signedToken = await serializeSigned(
							"",
							token,
							c.context.secret,
						);
						if (c.request) {
							c.request.headers.set(
								"cookie",
								`${
									c.context.authCookies.sessionToken.name
								}=${signedToken.replace("=", "")}`,
							);
						}
						if (c.headers) {
							c.headers.set(
								"cookie",
								`${
									c.context.authCookies.sessionToken.name
								}=${signedToken.replace("=", "")}`,
							);
						}
						return {
							context: c,
						};
					},
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
