import { declareEndpoint } from "../../better-call/shared";
import * as z from "zod";
import type { AdditionalUserFieldsInput, BetterAuthOptions } from "../../types";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { SocialProviderListEnum } from "../../social-providers";

export const signUpEmailDef = declareEndpoint("/sign-up/email", {
	method: "POST",
	body: z.record(z.string(), z.any()),
	metadata: {
		$Infer: {
			body: {} as {
				name: string;
				email: string;
				password: string;
				image?: string;
				callbackURL?: string;
				rememberMe?: boolean;
			} & AdditionalUserFieldsInput<BetterAuthOptions>,
		},
		openapi: {
			description: "Sign up a user using email and password",
			requestBody: {
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								name: {
									type: "string",
									description: "The name of the user",
								},
								email: {
									type: "string",
									description: "The email of the user",
								},
								password: {
									type: "string",
									description: "The password of the user",
								},
								image: {
									type: "string",
									description: "The profile image URL of the user",
								},
								callbackURL: {
									type: "string",
									description: "The URL to use for email verification callback",
								},
								rememberMe: {
									type: "boolean",
									description:
										"If this is false, the session will not be remembered. Default is `true`.",
								},
							},
							required: ["name", "email", "password"],
						},
					},
				},
			},
			responses: {
				"200": {
					description: "Successfully created user",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									token: {
										type: "string",
										nullable: true,
										description: "Authentication token for the session",
									},
									user: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "The unique identifier of the user",
											},
											email: {
												type: "string",
												format: "email",
												description: "The email address of the user",
											},
											name: {
												type: "string",
												description: "The name of the user",
											},
											image: {
												type: "string",
												nullable: true,
												description: "The profile image URL of the user",
											},
											emailVerified: {
												type: "boolean",
												description:
													"Whether the user's email has been verified",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description:
													"The date and time when the user was created",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
												description:
													"The date and time when the user was last updated",
											},
										},
										required: [
											"id",
											"email",
											"name",
											"emailVerified",
											"createdAt",
											"updatedAt",
										],
									},
								},
								required: ["user"],
							},
						},
					},
				},
				"422": {
					description:
						"Unprocessable Entity. User already exists or failed to create user.",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									message: {
										type: "string",
									},
								},
							},
						},
					},
				},
			},
		},
	},
});

// Simple endpoints
export const okDef = declareEndpoint("/ok", {
	method: "GET",
	metadata: {
		...HIDE_METADATA,
		openapi: {
			description: "Check if the API is working",
			responses: {
				"200": {
					description: "API is working",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									ok: {
										type: "boolean",
										description: "Indicates if the API is working",
									},
								},
								required: ["ok"],
							},
						},
					},
				},
			},
		},
	},
});

export const errorDef = declareEndpoint("/error", {
	method: "GET",
	metadata: {
		...HIDE_METADATA,
		openapi: {
			description: "Displays an error page",
			responses: {
				"200": {
					description: "Success",
					content: {
						"text/html": {
							schema: {
								type: "string",
								description: "The HTML content of the error page",
							},
						},
					},
				},
			},
		},
	},
});

export const signOutDef = declareEndpoint("/sign-out", {
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
});
// Sign-in endpoints
export const signInSocialDef = declareEndpoint("/sign-in/social", {
	method: "POST",
	body: z.object({
		callbackURL: z.string().optional(),
		newUserCallbackURL: z.string().optional(),
		errorCallbackURL: z.string().optional(),
		provider: SocialProviderListEnum,
		disableRedirect: z.boolean().optional(),
		idToken: z.optional(
			z.object({
				token: z.string(),
				nonce: z.string().optional(),
				accessToken: z.string().optional(),
				refreshToken: z.string().optional(),
				expiresAt: z.number().optional(),
			}),
		),
		scopes: z.array(z.string()).optional(),
		requestSignUp: z.boolean().optional(),
		loginHint: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Sign in with a social provider",
			operationId: "socialSignIn",
			responses: {
				"200": {
					description:
						"Success - Returns either session details or redirect URL",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									redirect: { type: "boolean" },
									token: { type: "string" },
									user: { type: "object" },
									url: { type: "string" },
								},
							},
						},
					},
				},
			},
		},
	},
});

export const signInEmailDef = declareEndpoint("/sign-in/email", {
	method: "POST",
	body: z.object({
		email: z.string(),
		password: z.string(),
		callbackURL: z.string().optional(),
		rememberMe: z.boolean().optional(),
	}),
	metadata: {
		openapi: {
			description: "Sign in with email and password",
			responses: {
				"200": {
					description: "Successfully signed in",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									token: { type: "string" },
									user: { type: "object" },
								},
							},
						},
					},
				},
			},
		},
	},
});

// Account endpoints
export const listUserAccountsDef = declareEndpoint("/list-accounts", {
	method: "GET",
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "List all accounts linked to the user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "array",
								items: {
									type: "object",
									properties: {
										id: { type: "string" },
										providerId: { type: "string" },
										createdAt: { type: "string", format: "date-time" },
										updatedAt: { type: "string", format: "date-time" },
										accountId: { type: "string" },
										scopes: { type: "array", items: { type: "string" } },
									},
									required: [
										"id",
										"providerId",
										"createdAt",
										"updatedAt",
										"accountId",
										"scopes",
									],
								},
							},
						},
					},
				},
			},
		},
	},
});

export const linkSocialAccountDef = declareEndpoint("/link-social", {
	method: "POST",
	requireHeaders: true,
	body: z.object({
		callbackURL: z.string().optional(),
		provider: SocialProviderListEnum,
		idToken: z
			.object({
				token: z.string(),
				nonce: z.string().optional(),
				accessToken: z.string().optional(),
				refreshToken: z.string().optional(),
				scopes: z.array(z.string()).optional(),
			})
			.optional(),
		requestSignUp: z.boolean().optional(),
		scopes: z.array(z.string()).optional(),
		errorCallbackURL: z.string().optional(),
		disableRedirect: z.boolean().optional(),
	}),
	metadata: {
		openapi: {
			description: "Link a social account to the user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									url: {
										type: "string",
										description:
											"The authorization URL to redirect the user to",
									},
									redirect: {
										type: "boolean",
										description:
											"Indicates if the user should be redirected to the authorization URL",
									},
									status: { type: "boolean" },
								},
								required: ["redirect"],
							},
						},
					},
				},
			},
		},
	},
});

export const unlinkAccountDef = declareEndpoint("/unlink-account", {
	method: "POST",
	requireHeaders: true,
	body: z.object({
		providerId: z.string(),
		accountId: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Unlink an account",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									status: { type: "boolean" },
								},
							},
						},
					},
				},
			},
		},
	},
});

export const getAccessTokenDef = declareEndpoint("/get-access-token", {
	method: "POST",
	body: z.object({
		providerId: z.string(),
		accountId: z.string().optional(),
		userId: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Get a valid access token, doing a refresh if needed",
			responses: {
				200: {
					description: "A Valid access token",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									tokenType: { type: "string" },
									idToken: { type: "string" },
									accessToken: { type: "string" },
									refreshToken: { type: "string" },
									accessTokenExpiresAt: { type: "string", format: "date-time" },
									refreshTokenExpiresAt: {
										type: "string",
										format: "date-time",
									},
								},
							},
						},
					},
				},
				400: {
					description: "Invalid refresh token or provider configuration",
				},
			},
		},
	},
});

export const refreshTokenDef = declareEndpoint("/refresh-token", {
	method: "POST",
	body: z.object({
		providerId: z.string(),
		accountId: z.string().optional(),
		userId: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Refresh the access token using a refresh token",
			responses: {
				200: {
					description: "Access token refreshed successfully",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									tokenType: { type: "string" },
									idToken: { type: "string" },
									accessToken: { type: "string" },
									refreshToken: { type: "string" },
									accessTokenExpiresAt: { type: "string", format: "date-time" },
									refreshTokenExpiresAt: {
										type: "string",
										format: "date-time",
									},
								},
							},
						},
					},
				},
				400: {
					description: "Invalid refresh token or provider configuration",
				},
			},
		},
	},
});

export const accountInfoDef = declareEndpoint("/account-info", {
	method: "POST",
	requireHeaders: true,
	body: z.object({
		accountId: z.string(),
	}),
	metadata: {
		openapi: {
			description: "Get the account info provided by the provider",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										type: "object",
										properties: {
											id: { type: "string" },
											name: { type: "string" },
											email: { type: "string" },
											image: { type: "string" },
											emailVerified: { type: "boolean" },
										},
										required: ["id", "emailVerified"],
									},
									data: {
										type: "object",
										properties: {},
										additionalProperties: true,
									},
								},
								required: ["user", "data"],
								additionalProperties: false,
							},
						},
					},
				},
			},
		},
	},
});

// Callback endpoints
const callbackSchema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
	device_id: z.string().optional(),
	error_description: z.string().optional(),
	state: z.string().optional(),
	user: z.string().optional(),
});

export const callbackOAuthDef = declareEndpoint("/callback/:id", {
	method: ["GET", "POST"],
	body: callbackSchema.optional(),
	query: callbackSchema.optional(),
	metadata: HIDE_METADATA,
});

// Email verification endpoints
export const sendVerificationEmailDef = declareEndpoint(
	"/send-verification-email",
	{
		method: "POST",
		body: z.object({
			email: z.string().email(),
			callbackURL: z.string().optional(),
		}),
		metadata: {
			openapi: {
				description: "Send a verification email to the user",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									email: {
										type: "string",
										description: "The email to send the verification email to",
										example: "user@example.com",
									},
									callbackURL: {
										type: "string",
										description:
											"The URL to use for email verification callback",
										example: "https://example.com/callback",
										nullable: true,
									},
								},
								required: ["email"],
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
										status: {
											type: "boolean",
											description:
												"Indicates if the email was sent successfully",
											example: true,
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
											example: "Verification email isn't enabled",
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
);

export const verifyEmailDef = declareEndpoint("/verify-email", {
	method: "GET",
	query: z.object({
		token: z.string(),
		callbackURL: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Verify the email of the user",
			parameters: [
				{
					name: "token",
					in: "query",
					description: "The token to verify the email",
					required: true,
					schema: { type: "string" },
				},
				{
					name: "callbackURL",
					in: "query",
					description: "The URL to redirect to after email verification",
					required: false,
					schema: { type: "string" },
				},
			],
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										type: "object",
										properties: {
											id: { type: "string" },
											email: { type: "string" },
											name: { type: "string" },
											image: { type: "string" },
											emailVerified: { type: "boolean" },
											createdAt: { type: "string" },
											updatedAt: { type: "string" },
										},
										required: [
											"id",
											"email",
											"name",
											"image",
											"emailVerified",
											"createdAt",
											"updatedAt",
										],
									},
									status: { type: "boolean" },
								},
								required: ["user", "status"],
							},
						},
					},
				},
			},
		},
	},
});

// Reset password endpoints
export const requestPasswordResetDef = declareEndpoint(
	"/request-password-reset",
	{
		method: "POST",
		body: z.object({
			email: z.string().email(),
			redirectTo: z.string().optional(),
		}),
		metadata: {
			openapi: {
				description: "Send a password reset email to the user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: { type: "boolean" },
										message: { type: "string" },
									},
								},
							},
						},
					},
				},
			},
		},
	},
);

export const forgetPasswordDef = declareEndpoint("/forget-password", {
	method: "POST",
	body: z.object({
		email: z.string().email(),
		redirectTo: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Send a password reset email to the user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									status: { type: "boolean" },
									message: { type: "string" },
								},
							},
						},
					},
				},
			},
		},
	},
});

export const requestPasswordResetCallbackDef = declareEndpoint(
	"/reset-password/:token",
	{
		method: "GET",
		query: z.object({
			callbackURL: z.string(),
		}),
		metadata: {
			openapi: {
				description: "Redirects the user to the callback URL with the token",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										token: { type: "string" },
									},
								},
							},
						},
					},
				},
			},
		},
	},
);

export const resetPasswordDef = declareEndpoint("/reset-password", {
	method: "POST",
	query: z
		.object({
			token: z.string().optional(),
		})
		.optional(),
	body: z.object({
		newPassword: z.string(),
		token: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Reset the password for a user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									status: { type: "boolean" },
								},
							},
						},
					},
				},
			},
		},
	},
});

// Session endpoints
const getSessionQuerySchema = z
	.object({
		disableCookieCache: z.coerce.boolean().optional(),
		disableRefresh: z.coerce.boolean().optional(),
	})
	.optional();

export const getSessionDef = declareEndpoint("/get-session", {
	method: "GET",
	query: getSessionQuerySchema,
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Get the current session",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									session: { $ref: "#/components/schemas/Session" },
									user: { $ref: "#/components/schemas/User" },
								},
								required: ["session", "user"],
							},
						},
					},
				},
			},
		},
	},
});

export const listSessionsDef = declareEndpoint("/list-sessions", {
	method: "GET",
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "List all active sessions for the user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "array",
								items: { $ref: "#/components/schemas/Session" },
							},
						},
					},
				},
			},
		},
	},
});

export const revokeSessionDef = declareEndpoint("/revoke-session", {
	method: "POST",
	requireHeaders: true,
	body: z.object({
		token: z.string(),
	}),
	metadata: {
		openapi: {
			description: "Revoke a single session",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									status: { type: "boolean" },
								},
							},
						},
					},
				},
			},
		},
	},
});

export const revokeSessionsDef = declareEndpoint("/revoke-sessions", {
	method: "POST",
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Revoke all sessions for the user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									status: { type: "boolean" },
								},
							},
						},
					},
				},
			},
		},
	},
});

export const revokeOtherSessionsDef = declareEndpoint(
	"/revoke-other-sessions",
	{
		method: "POST",
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Revoke all sessions except the current one",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: { type: "boolean" },
									},
								},
							},
						},
					},
				},
			},
		},
	},
);

// Update user endpoints
export const updateUserDef = declareEndpoint("/update-user", {
	method: "POST",
	body: z.record(z.string(), z.any()),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Update the current user",
			requestBody: {
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								name: { type: "string", description: "The name of the user" },
								image: { type: "string", description: "The image of the user" },
							},
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
									status: {
										type: "boolean",
										description: "Indicates if the update was successful",
									},
								},
							},
						},
					},
				},
			},
		},
	},
});

export const changePasswordDef = declareEndpoint("/change-password", {
	method: "POST",
	requireHeaders: true,
	body: z.object({
		newPassword: z.string(),
		currentPassword: z.string(),
		revokeOtherSessions: z.boolean().optional(),
	}),
	metadata: {
		openapi: {
			description: "Change the password of the user",
			responses: {
				"200": {
					description: "Password successfully changed",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									token: { type: "string", nullable: true },
									user: {
										type: "object",
										properties: {
											id: { type: "string" },
											email: { type: "string" },
											name: { type: "string" },
											image: { type: "string", nullable: true },
											emailVerified: { type: "boolean" },
											createdAt: { type: "string" },
											updatedAt: { type: "string" },
										},
										required: [
											"id",
											"email",
											"name",
											"emailVerified",
											"createdAt",
											"updatedAt",
										],
									},
								},
								required: ["user"],
							},
						},
					},
				},
			},
		},
	},
});

export const setPasswordDef = declareEndpoint("/set-password", {
	method: "POST",
	requireHeaders: true,
	body: z.object({
		newPassword: z.string(),
	}),
	metadata: {
		SERVER_ONLY: true,
	},
});

export const deleteUserDef = declareEndpoint("/delete-user", {
	method: "POST",
	requireHeaders: true,
	body: z.object({
		callbackURL: z.string().optional(),
		password: z.string().optional(),
		token: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Delete the user",
			responses: {
				"200": {
					description: "User deletion processed successfully",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									success: { type: "boolean" },
									message: {
										type: "string",
										enum: ["User deleted", "Verification email sent"],
									},
								},
								required: ["success", "message"],
							},
						},
					},
				},
			},
		},
	},
});

export const deleteUserCallbackDef = declareEndpoint("/delete-user/callback", {
	method: "GET",
	query: z.object({
		token: z.string(),
		callbackURL: z.string().optional(),
	}),
	metadata: {
		openapi: {
			description: "Callback to complete user deletion with verification token",
			responses: {
				"200": {
					description: "User successfully deleted",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									success: { type: "boolean" },
									message: { type: "string", enum: ["User deleted"] },
								},
								required: ["success", "message"],
							},
						},
					},
				},
			},
		},
	},
});

export const changeEmailDef = declareEndpoint("/change-email", {
	method: "POST",
	requireHeaders: true,
	body: z.object({
		newEmail: z.string().email(),
		callbackURL: z.string().optional(),
	}),
	metadata: {
		openapi: {
			responses: {
				"200": {
					description: "Email change request processed successfully",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									status: { type: "boolean" },
									message: {
										type: "string",
										enum: ["Email updated", "Verification email sent"],
										nullable: true,
									},
								},
								required: ["status"],
							},
						},
					},
				},
				"422": {
					description: "Unprocessable Entity. Email already exists",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									message: { type: "string" },
								},
							},
						},
					},
				},
			},
		},
	},
});
