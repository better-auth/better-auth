import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import { getSessionFromCtx } from "./session";
import { BASE_ERROR_CODES } from "../../error/codes";
import { validatePassword } from "../../utils/password";

export const verifyPassword = createAuthEndpoint(
	"/verify-password",
	{
		method: "POST",
		body: z.object({
			password: z.string({
				description: "The password to verify",
			}),
			email: z.string({
				description: "The email to check password for (only used if not authenticated)",
			}).email().optional(),
		}),
		metadata: {
			openapi: {
				description: "Verify if a password is valid for the user",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									password: {
										type: "string",
										description: "The password to verify",
									},
									email: {
										type: "string",
										description: "The email to check password for (only used if not authenticated)",
										nullable: true,
									}
								},
								required: ["password"],
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										valid: {
											type: "boolean",
											description: "Indicates if the password is valid",
										},
									},
								},
							},
						},
					},
					"401": {
						description: "Unauthorized",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										message: {
											type: "string",
											description: "Error message",
										},
									},
								},
							},
						},
					},
					"400": {
						description: "Bad Request",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										message: {
											type: "string",
											description: "Error message",
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
		const { password, email } = ctx.body;
		let userId: string | undefined;

		const session = await getSessionFromCtx(ctx);
		if (session) {
			userId = session.user.id;
		} else if (email) {
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.USER_NOT_FOUND,
				});
			}
			userId = user.user.id;
		} else {
			throw new APIError("BAD_REQUEST", {
				message: "Either authentication or email is required",
			});
		}

		if (!userId) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.USER_NOT_FOUND,
			});
		}

		const isValid = await validatePassword(ctx, {
			password,
			userId,
		});

		return ctx.json({
			valid: isValid,
		});
	},
); 