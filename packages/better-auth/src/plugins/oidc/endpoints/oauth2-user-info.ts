import type { OAuthAccessToken } from "../types";
import type { MakeOidcPlugin } from "../make-oidc-plugin";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { modelName } from "../schema";
import { getClient } from "../utils/get-client";
import { APIError, createAuthEndpoint } from "../../../api";

export const oAuth2userInfo = (
	options: ResolvedOIDCOptions,
	makePluginOpts: MakeOidcPlugin,
) =>
	createAuthEndpoint(
		`/${makePluginOpts.pathPrefix}/userinfo`,
		{
			method: "GET",

			metadata: {
				isAction: false,
				openapi: {
					description: "Get OAuth2 user information",
					responses: {
						"200": {
							description: "User information retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											sub: {
												type: "string",
												description: "Subject identifier (user ID)",
											},
											email: {
												type: "string",
												format: "email",
												nullable: true,
												description:
													"User's email address, included if 'email' scope is granted",
											},
											name: {
												type: "string",
												nullable: true,
												description:
													"User's full name, included if 'profile' scope is granted",
											},
											picture: {
												type: "string",
												format: "uri",
												nullable: true,
												description:
													"User's profile picture URL, included if 'profile' scope is granted",
											},
											given_name: {
												type: "string",
												nullable: true,
												description:
													"User's given name, included if 'profile' scope is granted",
											},
											family_name: {
												type: "string",
												nullable: true,
												description:
													"User's family name, included if 'profile' scope is granted",
											},
											email_verified: {
												type: "boolean",
												nullable: true,
												description:
													"Whether the email is verified, included if 'email' scope is granted",
											},
										},
										required: ["sub"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			if (!ctx.request) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "request not found",
					error: "invalid_request",
				});
			}
			const authorization = ctx.request.headers.get("authorization");
			if (!authorization) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "authorization header not found",
					error: "invalid_request",
				});
			}
			const token = authorization.replace("Bearer ", "");
			const accessToken = await ctx.context.adapter.findOne<OAuthAccessToken>({
				model: modelName.oauthAccessToken,
				where: [
					{
						field: "accessToken",
						value: token,
					},
				],
			});
			if (!accessToken) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "invalid access token",
					error: "invalid_token",
				});
			}
			if (accessToken.accessTokenExpiresAt < new Date()) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "The Access Token expired",
					error: "invalid_token",
				});
			}

			const client = await getClient(ctx, accessToken.clientId, options);
			if (!client) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "client not found",
					error: "invalid_token",
				});
			}

			const user = await ctx.context.internalAdapter.findUserById(
				accessToken.userId,
			);
			if (!user) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "user not found",
					error: "invalid_token",
				});
			}
			const requestedScopes = accessToken.scopes.split(" ");
			const baseUserClaims = {
				sub: user.id,
				email: requestedScopes.includes("email") ? user.email : undefined,
				name: requestedScopes.includes("profile") ? user.name : undefined,
				picture: requestedScopes.includes("profile") ? user.image : undefined,
				given_name: requestedScopes.includes("profile")
					? user.name.split(" ")[0]
					: undefined,
				family_name: requestedScopes.includes("profile")
					? user.name.split(" ")[1]
					: undefined,
				email_verified: requestedScopes.includes("email")
					? user.emailVerified
					: undefined,
			};
			const userClaims = options.getAdditionalUserInfoClaim
				? await options.getAdditionalUserInfoClaim(
						user,
						requestedScopes,
						client,
					)
				: baseUserClaims;
			return ctx.json({
				...baseUserClaims,
				...userClaims,
			});
		},
	);
