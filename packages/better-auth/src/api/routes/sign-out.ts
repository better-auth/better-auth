import { createAuthEndpoint } from "../call";
import { deleteSessionCookie } from "../../cookies";
import { APIError } from "better-call";
import { BASE_ERROR_CODES } from "../../error/codes";
import type { OrganizationOptions } from "../../plugins/organization/organization";
import { getSessionFromCtx } from "./session";

export const signOut = createAuthEndpoint(
	"/sign-out",
	{
		method: "POST",
		requireHeaders: true,
		metadata: {
			openapi: {
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
		if (!sessionCookieToken) {
			deleteSessionCookie(ctx);
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
			});
		}

		const orgPlugin = ctx.context.options.plugins?.find(
			(p) => p.id === "organization",
		);

		if (orgPlugin) {
			const orgOptions = orgPlugin.options as OrganizationOptions;
			if (orgOptions.autoCreateOrganizationOnSignUp) {
				const session = await getSessionFromCtx(ctx);
				if (session) {
					const activeOrgId = session.session?.activeOrganizationId;
					if (activeOrgId && session.user.id) {
						await ctx.context.internalAdapter.updateUser(session.user.id, {
							lastOrgId: activeOrgId,
						});
					}
				}
			}
		}

		await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
		deleteSessionCookie(ctx);
		return ctx.json({
			success: true,
		});
	},
);
