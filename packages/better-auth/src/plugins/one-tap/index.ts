import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../api";
import { setSessionCookie } from "../../cookies";
import type { BetterAuthPlugin } from "../../types";
import { betterFetch } from "@better-fetch/fetch";
import { toBoolean } from "../../utils/boolean";

interface OneTapOptions {
	/**
	 * Disable the signup flow
	 *
	 * @default false
	 */
	disableSignup?: boolean;
}

export const oneTap = (options?: OneTapOptions) =>
	({
		id: "one-tap",
		endpoints: {
			oneTapCallback: createAuthEndpoint(
				"/one-tap/callback",
				{
					method: "POST",
					body: z.object({
						idToken: z.string(),
					}),
				},
				async (c) => {
					const { idToken } = c.body;
					const { data, error } = await betterFetch<{
						email: string;
						email_verified: string;
						name: string;
						picture: string;
						sub: string;
					}>("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken);
					if (error) {
						return c.json({
							error: "Invalid token",
						});
					}
					const user = await c.context.internalAdapter.findUserByEmail(
						data.email,
					);
					if (!user) {
						if (options?.disableSignup) {
							throw new APIError("BAD_GATEWAY", {
								message: "User not found",
							});
						}
						const user = await c.context.internalAdapter.createOAuthUser(
							{
								email: data.email,
								emailVerified: toBoolean(data.email_verified),
								name: data.name,
								image: data.picture,
							},
							{
								providerId: "google",
								accountId: data.sub,
							},
						);
						if (!user) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Could not create user",
							});
						}
						const session = await c.context.internalAdapter.createSession(
							user?.user.id,
							c.request,
						);
						await setSessionCookie(c, {
							user: user.user,
							session,
						});
						return c.json({
							session,
							user,
						});
					}
					const session = await c.context.internalAdapter.createSession(
						user.user.id,
						c.request,
					);
					console.log({ session });
					await setSessionCookie(c, {
						user: user.user,
						session,
					});
					return c.json({
						session,
						user,
					});
				},
			),
		},
	}) satisfies BetterAuthPlugin;
