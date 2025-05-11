//@ts-nocheck
import { createAuthEndpoint, sessionMiddleware } from "./index";
import { z } from "zod";

export const oAuth2LinkAccount = createAuthEndpoint(
	"/oauth2/link",
	{
		method: "POST",
		body: z.object({
			providerId: z.string({
				description: `The OAuth provider ID. Eg: \"my-provider-id\"`
			}),
			callbackURL: z.string({
				description: `The URL to redirect to once the account linking was complete. Eg: "/successful-link"`
			}),
		}),
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "Link an OAuth2 account to the current user session",
				responses: {
					"200": {
						description:
							"Authorization URL generated successfully for linking an OAuth2 account",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										url: {
											type: "string",
											format: "uri",
											description:
												"The authorization URL to redirect the user to for linking the OAuth2 account",
										},
										redirect: {
											type: "boolean",
											description:
												"Indicates that the client should redirect to the provided URL",
											enum: [true],
										},
									},
									required: ["url", "redirect"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (c) => {
		const session = c.context.session;
		const provider = options.config.find(
			(p) => p.providerId === c.body.providerId,
		);
		if (!provider) {
			throw new APIError("NOT_FOUND", {
				message: BASE_ERROR_CODES.PROVIDER_NOT_FOUND,
			});
		}
		const {
			providerId,
			clientId,
			clientSecret,
			redirectURI,
			authorizationUrl,
			discoveryUrl,
			pkce,
			scopes,
			prompt,
			accessType,
			authorizationUrlParams,
		} = provider;

		let finalAuthUrl = authorizationUrl;
		if (!finalAuthUrl) {
			if (!discoveryUrl) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.INVALID_OAUTH_CONFIGURATION,
				});
			}
			const discovery = await betterFetch<{
				authorization_endpoint: string;
				token_endpoint: string;
			}>(discoveryUrl, {
				method: "GET",
				headers: provider.discoveryHeaders,
				onError(context) {
					c.context.logger.error(context.error.message, context.error, {
						discoveryUrl,
					});
				},
			});
			if (discovery.data) {
				finalAuthUrl = discovery.data.authorization_endpoint;
			}
		}

		if (!finalAuthUrl) {
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.INVALID_OAUTH_CONFIGURATION,
			});
		}

		const state = await generateState(c, {
			userId: session.user.id,
			email: session.user.email,
		});

		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId,
				clientSecret,
				redirectURI:
					redirectURI ||
					`${c.context.baseURL}/oauth2/callback/${providerId}`,
			},
			authorizationEndpoint: finalAuthUrl,
			state: state.state,
			codeVerifier: pkce ? state.codeVerifier : undefined,
			scopes: scopes || [],
			redirectURI: `${c.context.baseURL}/oauth2/callback/${providerId}`,
			prompt,
			accessType,
			additionalParams: authorizationUrlParams,
		});

		return c.json({
			url: url.toString(),
			redirect: true,
		});
	},
)