import type { MakeOidcPlugin } from "../make-oidc-plugin";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { APIError, sessionMiddleware, createAuthEndpoint } from "../../../api";
import { getClient } from "../utils/get-client";

export const getOAuthClient = (
	options: ResolvedOIDCOptions,
	makePluginOpts: MakeOidcPlugin,
) =>
	createAuthEndpoint(
		`/${makePluginOpts.pathPrefix}/client/:id`,
		{
			method: "GET",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Get OAuth2 client details",
					responses: {
						"200": {
							description: "OAuth2 client retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											clientId: {
												type: "string",
												description: "Unique identifier for the client",
											},
											name: {
												type: "string",
												description: "Name of the OAuth2 application",
											},
											icon: {
												type: "string",
												nullable: true,
												description: "Icon URL for the application",
											},
										},
										required: ["clientId", "name"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const client = await getClient(ctx, ctx.params.id, options);
			if (!client) {
				throw new APIError("NOT_FOUND", {
					error_description: "client not found",
					error: "not_found",
				});
			}
			return ctx.json({
				clientId: client.clientId as string,
				name: client.name as string,
				icon: client.icon as string,
			});
		},
	);
