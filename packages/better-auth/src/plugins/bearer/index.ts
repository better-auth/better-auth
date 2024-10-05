import { serializeSigned } from "better-call";
import { createAuthMiddleware } from "../../api/call";
import { BetterAuthError } from "../../error/better-auth-error";
import type { BetterAuthPlugin } from "../../types/plugins";

/**
 * Converts bearer token to session cookie
 */
export const bearer = () => {
	return {
		id: "bearer",
		async onRequest(request, ctx) {
			const token = request.headers
				.get("authorization")
				?.replace("Bearer ", "");
			if (!token) {
				return;
			}
			const headers = request.headers || new Headers();
			const signedToken = await serializeSigned("", token, ctx.secret);
			headers.set(
				"cookie",
				`${ctx.authCookies.sessionToken.name}=${signedToken.replace("=", "")}`,
			);
			return {
				request: new Request(request.url, {
					method: request.method,
					headers,
				}),
			};
		},
	} satisfies BetterAuthPlugin;
};
