//@ts-nocheck
import { createAuthEndpoint, adminMiddleware } from "./index";
import { z } from "zod";

export const setUserPassword = createAuthEndpoint(
	"/admin/set-user-password",
	{
		method: "POST",
		body: z.object({
			newPassword: z.string({
				description: "The new password. Eg: 'new-password'",
			}),
			userId: z.string({
				description: "The user id. Eg: 'user-id'",
			}),
		}),
		use: [adminMiddleware],
		metadata: {
			openapi: {
				operationId: "setUserPassword",
				summary: "Set a user's password",
				description: "Set a user's password",
				responses: {
					200: {
						description: "Password set",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
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
		const canSetUserPassword = hasPermission({
			userId: ctx.context.session.user.id,
			role: ctx.context.session.user.role,
			options: opts,
			permissions: {
				user: ["set-password"],
			},
		});
		if (!canSetUserPassword) {
			throw new APIError("FORBIDDEN", {
				message:
					ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD,
			});
		}
		const hashedPassword = await ctx.context.password.hash(
			ctx.body.newPassword,
		);
		await ctx.context.internalAdapter.updatePassword(
			ctx.body.userId,
			hashedPassword,
		);
		return ctx.json({
			status: true,
		});
	},
)