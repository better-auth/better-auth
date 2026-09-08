import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { deleteSessionCookie } from "../../cookies";

const signOutBodySchema = z
	.object({
		callbackURL: z
			.string()
			.meta({
				description: "The URL to redirect to after provider logout",
			})
			.optional(),
		disableRedirect: z
			.boolean()
			.meta({
				description: "Return the provider logout URL without redirecting",
			})
			.optional(),
		state: z
			.string()
			.meta({
				description: "State to pass to the provider logout endpoint",
			})
			.optional(),
	})
	.optional();

const signOutResponse = (
	providerLogout?: { url: string; redirect: boolean } | undefined,
) => ({
	success: true,
	url: providerLogout?.url,
	redirect: providerLogout?.redirect,
});

export const signOut = createAuthEndpoint(
	"/sign-out",
	{
		method: "POST",
		body: signOutBodySchema,
		operationId: "signOut",
		requireHeaders: true,
		metadata: {
			openapi: {
				operationId: "signOut",
				description: "Sign out the current user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										success: {
											type: "boolean",
										},
										url: {
											type: "string",
											description:
												"Provider logout URL when RP-initiated logout is available",
										},
										redirect: {
											type: "boolean",
											description:
												"Whether the client should redirect to the provider logout URL",
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			ctx.context.secret,
		);
		let currentSession: Awaited<
			ReturnType<typeof ctx.context.internalAdapter.findSession>
		> | null = null;
		if (sessionCookieToken) {
			try {
				currentSession =
					await ctx.context.internalAdapter.findSession(sessionCookieToken);
			} catch (e) {
				ctx.context.logger.error("Failed to read session from database", e);
			}
		}
		if (sessionCookieToken) {
			try {
				await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
			} catch (e) {
				ctx.context.logger.error("Failed to delete session from database", e);
			}
		}
		deleteSessionCookie(ctx);
		const providerLogoutResult = await (async () => {
			try {
				if (!currentSession) {
					return null;
				}
				const accounts = await ctx.context.internalAdapter.findAccounts(
					currentSession.user.id,
				);
				const providersById = new Map(
					ctx.context.socialProviders.map((provider) => [
						provider.id,
						provider,
					]),
				);
				const logoutAccounts = accounts
					.filter((account) =>
						Boolean(providersById.get(account.providerId)?.createEndSessionURL),
					)
					.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
				if (logoutAccounts.length === 0) {
					return null;
				}
				const seenProviderIds = new Set<string>();
				const postLogoutRedirectURI = ctx.body?.callbackURL
					? new URL(ctx.body.callbackURL, ctx.context.baseURL).toString()
					: undefined;
				for (const account of logoutAccounts) {
					if (seenProviderIds.has(account.providerId)) continue;
					seenProviderIds.add(account.providerId);
					const provider = providersById.get(account.providerId);
					try {
						const url = await provider?.createEndSessionURL?.({
							idToken: account.idToken,
							postLogoutRedirectURI,
							state: ctx.body?.state,
						});
						if (url) {
							return url.toString();
						}
					} catch (e) {
						ctx.context.logger.error(
							`Failed to create logout URL for provider "${account.providerId}"`,
							e,
						);
					}
				}
				return null;
			} catch (e) {
				ctx.context.logger.error("Failed to create provider logout URL", e);
				return null;
			}
		})();
		if (providerLogoutResult) {
			const shouldRedirect = !ctx.body?.disableRedirect;
			if (shouldRedirect) {
				ctx.setHeader("Location", providerLogoutResult);
			}
			return ctx.json(
				signOutResponse({
					url: providerLogoutResult,
					redirect: shouldRedirect,
				}),
			);
		}
		return ctx.json(signOutResponse());
	},
);
