import { z } from "zod";
import type { OAuthOptions } from "../types";
import { createAuthEndpoint } from "../../../api";
import {
	getClientEndpoint,
	updateClientEndpoint,
	rotateClientSecretEndpoint,
	deleteClientEndpoint,
	getClientsEndpoint,
} from "./endpoints";
import { createOAuthClientEndpoint } from "../register";

export const createOAuthClient = (opts: OAuthOptions) =>
	createAuthEndpoint(
		"/oauth2/client",
		{
			method: "POST",
			body: z.object({
				redirect_uris: z.array(z.string()),
				scope: z.string().optional(),
				client_name: z.string().optional(),
				client_uri: z.string().optional(),
				logo_uri: z.string().optional(),
				contacts: z.array(z.string()).optional(),
				tos_uri: z.string().optional(),
				policy_uri: z.string().optional(),
				software_id: z.string().optional(),
				software_version: z.string().optional(),
				software_statement: z.string().optional(),
				token_endpoint_auth_method: z
					.enum(["none", "client_secret_basic", "client_secret_post"])
					.default("client_secret_basic")
					.optional(),
				grant_types: z
					.array(
						z.enum([
							"authorization_code",
							"client_credentials",
							"refresh_token",
						]),
					)
					.default(["authorization_code"])
					.optional(),
				response_types: z
					.array(z.enum(["code"]))
					.default(["code"])
					.optional(),
				type: z.enum(["web", "native", "user-agent-based"]).optional(),
				// SERVER_ONLY applicable fields
				client_secret_expires_at: z
					.union([z.string(), z.number()])
					.optional()
					.default(0),
				skip_consent: z.boolean().optional(),
				metadata: z.object().optional(),
			}),
			metadata: {
				SERVER_ONLY: true,
				openapi: {
					description: "Register an OAuth2 application",
					responses: {
						"200": {
							description: "OAuth2 application registered successfully",
							content: {
								"application/json": {
									schema: {
										/** @returns {OauthClient} */
										type: "object",
										properties: {
											client_id: {
												type: "string",
												description: "Unique identifier for the client",
											},
											client_secret: {
												type: "string",
												description: "Secret key for the client",
											},
											client_secret_expires_at: {
												type: "number",
												description:
													"Time the client secret will expire. If 0, the client secret will never expire.",
											},
											scope: {
												type: "string",
												description:
													"Space-separated scopes allowed by the client",
											},
											user_id: {
												type: "string",
												description:
													"ID of the user who registered the client, null if registered anonymously",
											},
											client_id_issued_at: {
												type: "number",
												description: "Creation timestamp of this client",
											},
											client_name: {
												type: "string",
												description: "Name of the OAuth2 application",
											},
											client_uri: {
												type: "string",
												description: "Name of the OAuth2 application",
											},
											logo_uri: {
												type: "string",
												description: "Icon URL for the application",
											},
											contacts: {
												type: "array",
												items: {
													type: "string",
												},
												description:
													"List representing ways to contact people responsible for this client, typically email addresses",
											},
											tos_uri: {
												type: "string",
												description: "Client's terms of service uri",
											},
											policy_uri: {
												type: "string",
												description: "Client's policy uri",
											},
											software_id: {
												type: "string",
												description:
													"Unique identifier assigned by the developer to help in the dynamic registration process",
											},
											software_version: {
												type: "string",
												description: "Version identifier for the software_id",
											},
											software_statement: {
												type: "string",
												description:
													"JWT containing metadata values about the client software as claims",
											},
											redirect_uris: {
												type: "array",
												items: {
													type: "string",
													format: "uri",
												},
												description: "List of allowed redirect uris",
											},
											token_endpoint_auth_method: {
												type: "string",
												description:
													"Requested authentication method for the token endpoint",
												enum: [
													"none",
													"client_secret_basic",
													"client_secret_post",
												],
											},
											grant_types: {
												type: "array",
												items: {
													type: "string",
													enum: [
														"authorization_code",
														"client_credentials",
														"refresh_token",
													],
												},
												description:
													"Requested authentication method for the token endpoint",
											},
											response_types: {
												type: "array",
												items: {
													type: "string",
													enum: ["code"],
												},
												description:
													"Requested authentication method for the token endpoint",
											},
											public: {
												type: "boolean",
												description:
													"Whether the client is public as determined by the type",
											},
											type: {
												type: "string",
												description: "Type of the client",
												enum: ["web", "native", "user-agent-based"],
											},
											disabled: {
												type: "boolean",
												description: "Whether the client is disabled",
											},
											metadata: {
												type: "object",
												additionalProperties: true,
												nullable: true,
												description: "Additional metadata for the application",
											},
										},
										required: ["client_id"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			return createOAuthClientEndpoint(ctx, opts, {
				isRegister: false,
			});
		},
	);

export const getOAuthClient = (opts: OAuthOptions) =>
	createAuthEndpoint(
		"/oauth2/clients/:id",
		{
			method: "GET",
			metadata: {
				SERVER_ONLY: true,
				openapi: {
					description: "Get OAuth2 formatted client details",
				},
			},
		},
		async (ctx) => {
			return getClientEndpoint(ctx, opts);
		},
	);

export const getOAuthClients = (opts: OAuthOptions) =>
	createAuthEndpoint(
		"/oauth2/clients",
		{
			method: "GET",
			query: z.object({
				user_id: z.string().optional(),
				reference_id: z.string().optional(),
			}),
			metadata: {
				SERVER_ONLY: true,
				openapi: {
					description:
						"Get OAuth2 formatted client details for a user or organization",
				},
			},
		},
		async (ctx) => {
			return getClientsEndpoint(ctx, opts);
		},
	);

export const updateOAuthClient = (opts: OAuthOptions) =>
	createAuthEndpoint(
		"/oauth2/clients/:id",
		{
			method: "PATCH",
			body: z.object({
				redirect_uris: z.array(z.string()).optional(),
				scope: z.string().optional(),
				client_name: z.string().optional(),
				client_uri: z.string().optional(),
				logo_uri: z.string().optional(),
				contacts: z.array(z.string()).optional(),
				tos_uri: z.string().optional(),
				policy_uri: z.string().optional(),
				software_id: z.string().optional(),
				software_version: z.string().optional(),
				software_statement: z.string().optional(),
				// NOTE: token_endpoint_auth_method is currently immutable since it changes isPublic definition
				grant_types: z
					.array(
						z.enum([
							"authorization_code",
							"client_credentials",
							"refresh_token",
						]),
					)
					.default(["authorization_code"])
					.optional(),
				response_types: z
					.array(z.enum(["code"]))
					.default(["code"])
					.optional(),
				type: z.enum(["web", "native", "user-agent-based"]).optional(),
				// SERVER_ONLY applicable fields
				client_secret_expires_at: z
					.union([z.string(), z.number()])
					.optional()
					.default(0),
				skip_consent: z.boolean().optional(),
				metadata: z.object().optional(),
			}),
			metadata: {
				SERVER_ONLY: true,
				openapi: {
					description: "Updates OAuth2 formatted client details.",
				},
			},
		},
		async (ctx) => {
			return updateClientEndpoint(ctx, opts);
		},
	);

export const rotateClientSecret = (opts: OAuthOptions) =>
	createAuthEndpoint(
		"/oauth2/clients/:id/rotate-secret",
		{
			method: "POST",
			metadata: {
				SERVER_ONLY: true,
				openapi: {
					description: "Rotates a confidential client's secret",
				},
			},
		},
		async (ctx) => {
			return rotateClientSecretEndpoint(ctx, opts);
		},
	);

export const deleteOAuthClient = (opts: OAuthOptions) =>
	createAuthEndpoint(
		"/oauth2/clients/:id",
		{
			method: "DELETE",
			metadata: {
				SERVER_ONLY: true,
				openapi: {
					description: "Deletes an oauth client",
				},
			},
		},
		async (ctx) => {
			return deleteClientEndpoint(ctx, opts);
		},
	);
