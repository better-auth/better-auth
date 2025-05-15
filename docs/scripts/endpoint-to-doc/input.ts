//@ts-nocheck
import { createAuthEndpoint, sessionMiddleware } from "./index";
import { z } from "zod";

export const signInSSO = createAuthEndpoint(
	"/sign-in/sso",
	{
		method: "POST",
		body: z.object({
			email: z
				.string({
					description:
						'The email address to sign in with. This is used to identify the issuer to sign in with. It\'s optional if the issuer is provided. Eg: "john@example.com"',
				})
				.optional(),
			organizationSlug: z
				.string({
					description:
						'The slug of the organization to sign in with. Eg: "example-org"',
				})
				.optional(),
			providerId: z
				.string({
					description:
						'The ID of the provider to sign in with. This can be provided instead of email or issuer. Eg: "example-provider"',
				})
				.optional(),
			domain: z
				.string({
					description: 'The domain of the provider. Eg: "example.com"',
				})
				.optional(),
			callbackURL: z.string({
				description:
					'The URL to redirect to after login. Eg: "https://example.com/callback"',
			}),
			errorCallbackURL: z
				.string({
					description:
						'The URL to redirect to after login. Eg: "https://example.com/callback"',
				})
				.optional(),
			newUserCallbackURL: z
				.string({
					description:
						'The URL to redirect to after login if the user is new. Eg: "https://example.com/new-user"',
				})
				.optional(),
			scopes: z
				.array(z.string(), {
					description:
						'Scopes to request from the provider. Eg: ["openid", "email", "profile", "offline_access"]',
				})
				.optional(),
			requestSignUp: z
				.boolean({
					description:
						"Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider. Eg: true",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				summary: "Sign in with SSO provider",
				description:
					"This endpoint is used to sign in with an SSO provider. It redirects to the provider's authorization URL",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									email: {
										type: "string",
										description:
											"The email address to sign in with. This is used to identify the issuer to sign in with. It's optional if the issuer is provided",
									},
									issuer: {
										type: "string",
										description:
											"The issuer identifier, this is the URL of the provider and can be used to verify the provider and identify the provider during login. It's optional if the email is provided",
									},
									providerId: {
										type: "string",
										description:
											"The ID of the provider to sign in with. This can be provided instead of email or issuer",
									},
									callbackURL: {
										type: "string",
										description: "The URL to redirect to after login",
									},
									errorCallbackURL: {
										type: "string",
										description: "The URL to redirect to after login",
									},
									newUserCallbackURL: {
										type: "string",
										description:
											"The URL to redirect to after login if the user is new",
									},
								},
								required: ["callbackURL"],
							},
						},
					},
				},
				responses: {
					"200": {
						description:
							"Authorization URL generated successfully for SSO sign-in",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										url: {
											type: "string",
											format: "uri",
											description:
												"The authorization URL to redirect the user to for SSO sign-in",
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
	async (ctx) => {
		const body = ctx.body;
		let { email, organizationSlug, providerId, domain } = body;
		if (!email && !organizationSlug && !domain && !providerId) {
			throw new APIError("BAD_REQUEST", {
				message: "email, organizationSlug, domain or providerId is required",
			});
		}
		domain = body.domain || email?.split("@")[1];
		let orgId = "";
		if (organizationSlug) {
			orgId = await ctx.context.adapter
				.findOne<{ id: string }>({
					model: "organization",
					where: [
						{
							field: "slug",
							value: organizationSlug,
						},
					],
				})
				.then((res) => {
					if (!res) {
						return "";
					}
					return res.id;
				});
		}
		const provider = await ctx.context.adapter
			.findOne<SSOProvider>({
				model: "ssoProvider",
				where: [
					{
						field: providerId
							? "providerId"
							: orgId
								? "organizationId"
								: "domain",
						value: providerId || orgId || domain!,
					},
				],
			})
			.then((res) => {
				if (!res) {
					return null;
				}
				return {
					...res,
					oidcConfig: JSON.parse(res.oidcConfig as unknown as string),
				};
			});
		if (!provider) {
			throw new APIError("NOT_FOUND", {
				message: "No provider found for the issuer",
			});
		}
		const state = await generateState(ctx);
		const redirectURI = `${ctx.context.baseURL}/sso/callback/${provider.providerId}`;
		const authorizationURL = await createAuthorizationURL({
			id: provider.issuer,
			options: {
				clientId: provider.oidcConfig.clientId,
				clientSecret: provider.oidcConfig.clientSecret,
			},
			redirectURI,
			state: state.state,
			codeVerifier: provider.oidcConfig.pkce ? state.codeVerifier : undefined,
			scopes: ctx.body.scopes || [
				"openid",
				"email",
				"profile",
				"offline_access",
			],
			authorizationEndpoint: provider.oidcConfig.authorizationEndpoint,
		});
		return ctx.json({
			url: authorizationURL.toString(),
			redirect: true,
		});
	},
);
