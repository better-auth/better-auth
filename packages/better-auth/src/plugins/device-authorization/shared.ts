import { declareEndpoint } from "../../better-call/shared";
import * as z from "zod";

export const deviceCodeDef = declareEndpoint("/device/code", {
	method: "POST",
	body: z.object({
		client_id: z.string().meta({
			description: "The client ID of the application",
		}),
		scope: z
			.string()
			.meta({
				description: "Space-separated list of scopes",
			})
			.optional(),
	}),
	error: z.object({
		error: z.enum(["invalid_request", "invalid_client"]).meta({
			description: "Error code",
		}),
		error_description: z.string().meta({
			description: "Detailed error description",
		}),
	}),
	metadata: {
		openapi: {
			description: `Request a device and user code

Follow [rfc8628#section-3.2](https://datatracker.ietf.org/doc/html/rfc8628#section-3.2)`,
			responses: {
				200: {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									device_code: {
										type: "string",
										description: "The device verification code",
									},
									user_code: {
										type: "string",
										description: "The user code to display",
									},
									verification_uri: {
										type: "string",
										description: "The URL for user verification",
									},
									verification_uri_complete: {
										type: "string",
										description: "The complete URL with user code",
									},
									expires_in: {
										type: "number",
										description: "Lifetime in seconds of the device code",
									},
									interval: {
										type: "number",
										description: "Minimum polling interval in seconds",
									},
								},
							},
						},
					},
				},
				400: {
					description: "Error response",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									error: {
										type: "string",
										enum: ["invalid_request", "invalid_client"],
									},
									error_description: {
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

export const deviceTokenDef = declareEndpoint("/device/token", {
	method: "POST",
	body: z.object({
		grant_type: z.literal("urn:ietf:params:oauth:grant-type:device_code").meta({
			description: "The grant type for device flow",
		}),
		device_code: z.string().meta({
			description: "The device verification code",
		}),
		client_id: z.string().meta({
			description: "The client ID of the application",
		}),
	}),
	error: z.object({
		error: z
			.enum([
				"authorization_pending",
				"slow_down",
				"expired_token",
				"access_denied",
				"invalid_request",
				"invalid_grant",
			])
			.meta({
				description: "Error code",
			}),
		error_description: z.string().meta({
			description: "Detailed error description",
		}),
	}),
	metadata: {
		openapi: {
			description: `Exchange device code for access token

Follow [rfc8628#section-3.4](https://datatracker.ietf.org/doc/html/rfc8628#section-3.4)`,
			responses: {
				200: {
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
				400: {
					description: "Error response",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									error: {
										type: "string",
										enum: [
											"authorization_pending",
											"slow_down",
											"expired_token",
											"access_denied",
											"invalid_request",
											"invalid_grant",
										],
									},
									error_description: {
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

export const deviceVerifyDef = declareEndpoint("/device", {
	method: "GET",
	query: z.object({
		user_code: z.string().meta({
			description: "The user code to verify",
		}),
	}),
	error: z.object({
		error: z.enum(["invalid_request"]).meta({
			description: "Error code",
		}),
		error_description: z.string().meta({
			description: "Detailed error description",
		}),
	}),
	metadata: {
		openapi: {
			description: "Display device verification page",
			responses: {
				200: {
					description: "Verification page HTML",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user_code: {
										type: "string",
										description: "The user code to verify",
									},
									status: {
										type: "string",
										enum: ["pending", "approved", "denied"],
										description: "Current status of the device authorization",
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

export const deviceApproveDef = declareEndpoint("/device/approve", {
	method: "POST",
	body: z.object({
		userCode: z.string().meta({
			description: "The user code to approve",
		}),
	}),
	error: z.object({
		error: z
			.enum([
				"invalid_request",
				"expired_token",
				"device_code_already_processed",
			])
			.meta({
				description: "Error code",
			}),
		error_description: z.string().meta({
			description: "Detailed error description",
		}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Approve device authorization",
			responses: {
				200: {
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

export const deviceDenyDef = declareEndpoint("/device/deny", {
	method: "POST",
	body: z.object({
		userCode: z.string().meta({
			description: "The user code to deny",
		}),
	}),
	metadata: {
		openapi: {
			description: "Deny device authorization",
			responses: {
				200: {
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
