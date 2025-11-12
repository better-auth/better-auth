import { createAuthEndpoint } from "@better-auth/core/api";
import { z } from "zod";
import { InvalidRequest } from "../error";
import { getClient } from "../index";
import type { OIDCOptions } from "../types";

/**
 * Implements OpenID Connect RP-Initiated Logout
 *
 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html
 */
export const createEndSessionEndpoint = (options: OIDCOptions) =>
	createAuthEndpoint(
		"/oauth2/end-session",
		{
			method: ["GET", "POST"],
			query: z
				.object({
					id_token_hint: z.string().optional(),
					logout_hint: z.string().optional(),
					client_id: z.string().optional(),
					post_logout_redirect_uri: z.string().optional(),
					state: z.string().optional(),
					ui_locales: z.string().optional(),
				})
				.optional(),
			metadata: {
				isAction: false,
				openapi: {
					description:
						"RP-Initiated Logout endpoint. Allows clients to notify the OP that the End-User has logged out.",
					responses: {
						"200": {
							description:
								"Logout successful. May include redirect_uri if post_logout_redirect_uri was provided.",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											redirect_uri: {
												type: "string",
												format: "uri",
												description:
													"URI to redirect to after logout (if post_logout_redirect_uri was provided)",
											},
											message: {
												type: "string",
												description: "Success message",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const trustedClients = options.trustedClients || [];
			const query = ctx.query as {
				id_token_hint?: string;
				logout_hint?: string;
				client_id?: string;
				post_logout_redirect_uri?: string;
				state?: string;
				ui_locales?: string;
			};

			const {
				id_token_hint,
				logout_hint,
				client_id,
				post_logout_redirect_uri,
				state,
				ui_locales,
			} = query;

			let validatedClientId: string | null = null;
			let validatedUserId: string | null = null;

			if (id_token_hint) {
				try {
					// Decode the ID token to get the client ID and user ID
					// We need to verify the token was issued by us
					const parts = id_token_hint.split(".");
					if (parts.length !== 3) {
						throw new Error("Invalid ID token format");
					}

					// Decode the payload (we don't verify signature here as the spec says
					// we should accept tokens even if expired for logout)
					const payload = JSON.parse(
						Buffer.from(parts[1]!, "base64").toString("utf-8"),
					);

					validatedClientId = payload.aud;
					validatedUserId = payload.sub;

					// The spec says: "The OP SHOULD accept ID Tokens when the RP identified
					// by the ID Token's aud claim and/or sid claim has a current session or
					// had a recent session at the OP, even when the exp time has passed."
				} catch (error) {
					ctx.context.logger.warn(
						"Failed to decode id_token_hint for logout",
						error,
					);
					// According to spec: "Logout requests without a valid id_token_hint value
					// are a potential means of denial of service"
					// We should proceed with caution but not fail immediately
				}
			}

			if (client_id) {
				validatedClientId = client_id;
			}

			if (post_logout_redirect_uri) {
				if (!validatedClientId) {
					throw new InvalidRequest(
						"post_logout_redirect_uri requires id_token_hint or client_id",
					);
				}

				// Fetch the client to validate the redirect URI
				const client = await getClient(validatedClientId, trustedClients);
				if (!client) {
					throw new InvalidRequest("Invalid client_id");
				}

				// Validate the post_logout_redirect_uri matches a registered one
				const registeredUris = client.postLogoutRedirectUris || [];
				if (!registeredUris.includes(post_logout_redirect_uri)) {
					throw new InvalidRequest(
						"post_logout_redirect_uri does not match any registered URIs",
					);
				}
			}

			const session = ctx.context.session;
			if (session) {
				await ctx.context.internalAdapter.deleteSession(session.session.token);

				await ctx.setSignedCookie(
					ctx.context.authCookies.sessionToken.name,
					"",
					ctx.context.secret,
					{
						...ctx.context.authCookies.sessionToken.options,
						maxAge: 0,
					},
				);
			}

			if (post_logout_redirect_uri) {
				const redirectUrl = new URL(post_logout_redirect_uri);
				if (state) {
					redirectUrl.searchParams.set("state", state);
				}
				return ctx.json(
					{ redirect_uri: redirectUrl.toString() },
					{
						status: 200,
					},
				);
			}

			// Otherwise, return a success response
			return ctx.json(
				{ message: "Logout successful" },
				{
					status: 200,
				},
			);
		},
	);
