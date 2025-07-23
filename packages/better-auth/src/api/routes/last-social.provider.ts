import { APIError } from "better-call";
import { createAuthEndpoint } from "../call";
import { type SocialProvider } from "../../social-providers";

export const lastUsedSocialProvider = createAuthEndpoint(
	"/last-used-social-provider",
	{
		method: "GET",
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Get the last social provider the user used to sign in.",
				operationId: "socialLastUsed",
				responses: {
					"200": {
						description:
							"Success - Returns the provider ID of the last social provider",
						content: {
							"application/json": {
								schema: {
									type: "string",
									description: "Social Provider ID",
								},
							},
						},
					},
				},
			},
		},
	},
	async (c) => {
		const providerId = c.getCookie(
			c.context.authCookies.lastUsedSocial.name,
			c.context.authCookies.lastUsedSocial.options.prefix,
		);

		if (!providerId) {
			throw new APIError("NOT_FOUND");
		}

		return providerId as SocialProvider;
	},
);
