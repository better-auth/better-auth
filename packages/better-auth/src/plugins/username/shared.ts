import { declareEndpoint } from "../../better-call/shared";
import * as z from "zod";

export const signInUsernameDef = declareEndpoint("/sign-in/username", {
	method: "POST",
	body: z.object({
		username: z.string().meta({ description: "The username of the user" }),
		password: z.string().meta({ description: "The password of the user" }),
		rememberMe: z
			.boolean()
			.meta({
				description: "Remember the user session",
			})
			.optional(),
		callbackURL: z
			.string()
			.meta({
				description: "The URL to redirect to after email verification",
			})
			.optional(),
	}),
	metadata: {
		openapi: {
			summary: "Sign in with username",
			description: "Sign in with username",
			responses: {
				200: {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									token: {
										type: "string",
										description: "Session token for the authenticated session",
									},
									user: {
										$ref: "#/components/schemas/User",
									},
								},
								required: ["token", "user"],
							},
						},
					},
				},
			},
		},
	},
});

export const isUsernameAvailableDef = declareEndpoint(
	"/is-username-available",
	{
		method: "POST",
		body: z.object({
			username: z.string().meta({
				description: "The username to check",
			}),
		}),
		metadata: {
			openapi: {
				summary: "Check username availability",
				description: "Check if a username is available",
				responses: {
					200: {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										available: {
											type: "boolean",
											description: "Whether the username is available",
										},
									},
									required: ["available"],
								},
							},
						},
					},
				},
			},
		},
	},
);
