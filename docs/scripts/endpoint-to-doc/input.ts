//@ts-nocheck
import { createAuthEndpoint, sessionMiddleware } from "./index";
import { z } from "zod";

export const registerOAuthApplicatio =  createAuthEndpoint(
	"/oauth2/register",
	{
		method: "POST",
		body: z.object({
			redirect_uris: z.array(z.string(), {
				description:
					'A list of redirect URIs. Eg: ["https://client.example.com/callback"]',
			}),
			token_endpoint_auth_method: z
				.enum(["none", "client_secret_basic", "client_secret_post"], {
					description:
						'The authentication method for the token endpoint. Eg: "client_secret_basic"',
				})
				.default("client_secret_basic")
				.optional(),
			grant_types: z
				.array(
					z.enum([
						"authorization_code",
						"implicit",
						"password",
						"client_credentials",
						"refresh_token",
						"urn:ietf:params:oauth:grant-type:jwt-bearer",
						"urn:ietf:params:oauth:grant-type:saml2-bearer",
					]),
					{
						description:
							'The grant types supported by the application. Eg: ["authorization_code"]',
					},
				)
				.default(["authorization_code"])
				.optional(),
			response_types: z
				.array(z.enum(["code", "token"]), {
					description:
						'The response types supported by the application. Eg: ["code"]',
				})
				.default(["code"])
				.optional(),
			client_name: z
				.string({
					description: 'The name of the application. Eg: "My App"',
				})
				.optional(),
			client_uri: z
				.string({
					description:
						'The URI of the application. Eg: "https://client.example.com"',
				})
				.optional(),
			logo_uri: z
				.string({
					description:
						'The URI of the application logo. Eg: "https://client.example.com/logo.png"',
				})
				.optional(),
			scope: z
				.string({
					description:
						'The scopes supported by the application. Separated by spaces. Eg: "profile email"',
				})
				.optional(),
			contacts: z
				.array(z.string(), {
					description:
						'The contact information for the application. Eg: ["admin@example.com"]',
				})
				.optional(),
			tos_uri: z
				.string({
					description:
						'The URI of the application terms of service. Eg: "https://client.example.com/tos"',
				})
				.optional(),
			policy_uri: z
				.string({
					description:
						'The URI of the application privacy policy. Eg: "https://client.example.com/policy"',
				})
				.optional(),
			jwks_uri: z
				.string({
					description:
						'The URI of the application JWKS. Eg: "https://client.example.com/jwks"',
				})
				.optional(),
			jwks: z
				.record(z.any(), {
					description:
						'The JWKS of the application. Eg: {"keys": [{"kty": "RSA", "alg": "RS256", "use": "sig", "n": "...", "e": "..."}]}',
				})
				.optional(),
			metadata: z
				.record(z.any(), {
					description:
						'The metadata of the application. Eg: {"key": "value"}',
				})
				.optional(),
			software_id: z
				.string({
					description:
						'The software ID of the application. Eg: "my-software"',
				})
				.optional(),
			software_version: z
				.string({
					description:
						'The software version of the application. Eg: "1.0.0"',
				})
				.optional(),
			software_statement: z
				.string({
					description: "The software statement of the application.",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				description: "Register an OAuth2 application",
				responses: {
					"200": {
						description: "OAuth2 application registered successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										name: {
											type: "string",
											description: "Name of the OAuth2 application",
										},
										icon: {
											type: "string",
											nullable: true,
											description: "Icon URL for the application",
										},
										metadata: {
											type: "object",
											additionalProperties: true,
											nullable: true,
											description:
												"Additional metadata for the application",
										},
										clientId: {
											type: "string",
											description: "Unique identifier for the client",
										},
										clientSecret: {
											type: "string",
											description: "Secret key for the client",
										},
										redirectURLs: {
											type: "array",
											items: { type: "string", format: "uri" },
											description: "List of allowed redirect URLs",
										},
										type: {
											type: "string",
											description: "Type of the client",
											enum: ["web"],
										},
										authenticationScheme: {
											type: "string",
											description:
												"Authentication scheme used by the client",
											enum: ["client_secret"],
										},
										disabled: {
											type: "boolean",
											description: "Whether the client is disabled",
											enum: [false],
										},
										userId: {
											type: "string",
											nullable: true,
											description:
												"ID of the user who registered the client, null if registered anonymously",
										},
										createdAt: {
											type: "string",
											format: "date-time",
											description: "Creation timestamp",
										},
										updatedAt: {
											type: "string",
											format: "date-time",
											description: "Last update timestamp",
										},
									},
									required: [
										"name",
										"clientId",
										"clientSecret",
										"redirectURLs",
										"type",
										"authenticationScheme",
										"disabled",
										"createdAt",
										"updatedAt",
									],
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
		const session = await getSessionFromCtx(ctx);

		// Check authorization
		if (!session && !options.allowDynamicClientRegistration) {
			throw new APIError("UNAUTHORIZED", {
				error: "invalid_token",
				error_description:
					"Authentication required for client registration",
			});
		}

		// Validate redirect URIs for redirect-based flows
		if (
			(!body.grant_types ||
				body.grant_types.includes("authorization_code") ||
				body.grant_types.includes("implicit")) &&
			(!body.redirect_uris || body.redirect_uris.length === 0)
		) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_redirect_uri",
				error_description:
					"Redirect URIs are required for authorization_code and implicit grant types",
			});
		}

		// Validate correlation between grant_types and response_types
		if (body.grant_types && body.response_types) {
			if (
				body.grant_types.includes("authorization_code") &&
				!body.response_types.includes("code")
			) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_client_metadata",
					error_description:
						"When 'authorization_code' grant type is used, 'code' response type must be included",
				});
			}
			if (
				body.grant_types.includes("implicit") &&
				!body.response_types.includes("token")
			) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_client_metadata",
					error_description:
						"When 'implicit' grant type is used, 'token' response type must be included",
				});
			}
		}

		const clientId =
			options.generateClientId?.() ||
			generateRandomString(32, "a-z", "A-Z");
		const clientSecret =
			options.generateClientSecret?.() ||
			generateRandomString(32, "a-z", "A-Z");

		// Create the client with the existing schema
		const client: Client = await ctx.context.adapter.create({
			model: modelName.oauthClient,
			data: {
				name: body.client_name,
				icon: body.logo_uri,
				metadata: body.metadata ? JSON.stringify(body.metadata) : null,
				clientId: clientId,
				clientSecret: clientSecret,
				redirectURLs: body.redirect_uris.join(","),
				type: "web",
				authenticationScheme:
					body.token_endpoint_auth_method || "client_secret_basic",
				disabled: false,
				userId: session?.session.userId,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Format the response according to RFC7591
		return ctx.json(
			{
				client_id: clientId,
				client_secret: clientSecret,
				client_id_issued_at: Math.floor(Date.now() / 1000),
				client_secret_expires_at: 0, // 0 means it doesn't expire
				redirect_uris: body.redirect_uris,
				token_endpoint_auth_method:
					body.token_endpoint_auth_method || "client_secret_basic",
				grant_types: body.grant_types || ["authorization_code"],
				response_types: body.response_types || ["code"],
				client_name: body.client_name,
				client_uri: body.client_uri,
				logo_uri: body.logo_uri,
				scope: body.scope,
				contacts: body.contacts,
				tos_uri: body.tos_uri,
				policy_uri: body.policy_uri,
				jwks_uri: body.jwks_uri,
				jwks: body.jwks,
				software_id: body.software_id,
				software_version: body.software_version,
				software_statement: body.software_statement,
				metadata: body.metadata,
			},
			{
				status: 201,
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			},
		);
	},
)