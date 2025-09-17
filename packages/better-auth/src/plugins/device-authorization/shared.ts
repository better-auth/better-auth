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
