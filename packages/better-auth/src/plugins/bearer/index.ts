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
						let token =
							c.request?.headers.get("authorization")?.replace("Bearer ", "") ||
							c.headers?.get("authorization")?.replace("Bearer ", "");

						if (!token) {
							return;
						}

						if (!token.includes(".")) {
							token = await serializeSigned("", token, c.context.secret);
						}

						const headers = c.request?.headers || c.headers;

						if (headers) {
							headers.set(
								"cookie",
								c.context.authCookies.sessionToken.name.concat(
									"=",
									token.replace("=", ""),
								),
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
