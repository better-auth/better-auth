import { declareEndpoint } from "../../better-call/shared";
import * as z from "zod";

export const setRoleDef = declareEndpoint("/admin/set-role", {
	method: "POST",
	body: z.object({
		userId: z.coerce.string().meta({
			description: "The user id",
		}),
		role: z
			.union([
				z.string().meta({
					description: "The role to set. `admin` or `user` by default",
				}),
				z.array(
					z.string().meta({
						description: "The roles to set. `admin` or `user` by default",
					}),
				),
			])
			.meta({
				description:
					"The role to set, this can be a string or an array of strings. Eg: `admin` or `[admin, user]`",
			}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Set the role for a user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										$ref: "#/components/schemas/User",
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

export const getUserDef = declareEndpoint("/admin/get-user", {
	method: "POST",
	body: z.object({
		userId: z.string().meta({
			description: "The user id to get",
		}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Get a user by id",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										$ref: "#/components/schemas/User",
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

export const createUserDef = declareEndpoint("/admin/create-user", {
	method: "POST",
	body: z.record(z.string(), z.any()),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Create a user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										$ref: "#/components/schemas/User",
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

export const adminUpdateUserDef = declareEndpoint("/admin/update-user", {
	method: "POST",
	body: z.record(z.string(), z.any()),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Update a user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										$ref: "#/components/schemas/User",
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

export const listUsersDef = declareEndpoint("/admin/list-users", {
	method: "GET",
	query: z
		.object({
			limit: z
				.number()
				.or(z.string().transform((v) => parseInt(v)))
				.meta({
					description: "The number of users to return",
				})
				.optional(),
			offset: z
				.number()
				.or(z.string().transform((v) => parseInt(v)))
				.meta({
					description: "The number of users to skip",
				})
				.optional(),
			sortBy: z
				.enum(["createdAt", "name", "email"])
				.meta({
					description: "The field to sort by",
				})
				.optional(),
			sortDirection: z
				.enum(["asc", "desc"])
				.meta({
					description: "The direction to sort",
				})
				.optional(),
		})
		.optional(),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "List all users",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "array",
								items: {
									$ref: "#/components/schemas/User",
								},
							},
						},
					},
				},
			},
		},
	},
});

export const listUserSessionsDef = declareEndpoint(
	"/admin/list-user-sessions",
	{
		method: "POST",
		body: z.object({
			userId: z.string().meta({
				description: "The user id to get sessions for",
			}),
		}),
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "List all sessions for a user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: {
										$ref: "#/components/schemas/Session",
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

export const unbanUserDef = declareEndpoint("/admin/unban-user", {
	method: "POST",
	body: z.object({
		userId: z.string().meta({
			description: "The user id to unban",
		}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Unban a user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										$ref: "#/components/schemas/User",
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

export const banUserDef = declareEndpoint("/admin/ban-user", {
	method: "POST",
	body: z.object({
		userId: z.string().meta({
			description: "The user id to ban",
		}),
		reason: z
			.string()
			.meta({
				description: "The reason for banning the user",
			})
			.optional(),
		/**
		 * If true, the user will be permanently banned. If false or not provided, the user will be temporarily banned.
		 */
		banUntil: z
			.date()
			.or(z.string().transform((v) => new Date(v)))
			.meta({
				description: "The date until which the user is banned",
			})
			.optional(),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Ban a user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										$ref: "#/components/schemas/User",
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

export const impersonateUserDef = declareEndpoint("/admin/impersonate-user", {
	method: "POST",
	body: z.object({
		userId: z.string().meta({
			description: "The user id to impersonate",
		}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Impersonate a user",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									session: {
										$ref: "#/components/schemas/Session",
									},
									user: {
										$ref: "#/components/schemas/User",
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

export const stopImpersonatingDef = declareEndpoint(
	"/admin/stop-impersonating",
	{
		method: "POST",
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Stop impersonating a user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										session: {
											$ref: "#/components/schemas/Session",
										},
										user: {
											$ref: "#/components/schemas/User",
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

export const revokeUserSessionDef = declareEndpoint(
	"/admin/revoke-user-session",
	{
		method: "POST",
		body: z.object({
			sessionToken: z.string().meta({
				description: "The session token to revoke",
			}),
		}),
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Revoke a user session",
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
);

export const revokeUserSessionsDef = declareEndpoint(
	"/admin/revoke-user-sessions",
	{
		method: "POST",
		body: z.object({
			userId: z.string().meta({
				description: "The user id to revoke sessions for",
			}),
		}),
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Revoke all user sessions",
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
);

export const removeUserDef = declareEndpoint("/admin/remove-user", {
	method: "POST",
	body: z.object({
		userId: z.string().meta({
			description: "The user id to remove",
		}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Remove a user",
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

export const setUserPasswordDef = declareEndpoint("/admin/set-user-password", {
	method: "POST",
	body: z.object({
		userId: z.string().meta({
			description: "The user id to set password for",
		}),
		password: z.string().meta({
			description: "The new password",
		}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Set user password",
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

export const userHasPermissionDef = declareEndpoint(
	"/admin/user-has-permission",
	{
		method: "POST",
		body: z.object({
			userId: z.string().meta({
				description: "The user id to check permissions for",
			}),
			permission: z.record(z.string(), z.array(z.string())).meta({
				description: "The permission to check",
			}),
		}),
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Check if user has permission",
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
);
