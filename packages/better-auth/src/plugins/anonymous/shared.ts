import { declareEndpoint } from "../../better-call/shared";

export const signInAnonymousDef = declareEndpoint("/sign-in/anonymous", {
	method: "POST",
	metadata: {
		openapi: {
			description: "Sign in anonymously",
			responses: {
				200: {
					description: "Sign in anonymously",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									user: {
										$ref: "#/components/schemas/User",
									},
									session: {
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
});
