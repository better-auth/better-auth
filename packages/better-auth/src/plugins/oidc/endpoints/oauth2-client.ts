import type { MakeOIDCPlugin } from "../index";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { getClient } from "../utils/get-client";
import { APIError, sessionMiddleware, createAuthEndpoint } from "../../../api";

export const oAuth2Client = (
	options: ResolvedOIDCOptions,
	makePluginOpts: MakeOIDCPlugin,
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
			const client = await getClient(
				ctx,
				options,
				makePluginOpts,
				ctx.params.id,
			);
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
