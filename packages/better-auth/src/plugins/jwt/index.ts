import type { BetterAuthPlugin } from "../../types";
import { schema } from "./schema";
import { getJwksAdapter } from "./adapter";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import { mergeSchema } from "../../db/schema";
import { BetterAuthError } from "../../error";
import { createJwkOnDb, signJwtPayload } from "./sign";
import type { JwtPluginOptions } from "./types";
export type * from "./types";
export { createJwk, getJwtToken, signJwt } from "./sign";
export { getJwtPlugin } from "./utils";

export const jwt = (options?: JwtPluginOptions) => {
	// Remote url must be set when using signing function
	if (options?.jwt?.sign && !options.jwks?.remoteUrl) {
		throw new BetterAuthError(
			"jwks_config",
			"jwks.remoteUrl must be set when using jwt.sign",
		);
	}

	// Alg is required to be specified when using remote url (needed in openid metadata)
	if (options?.jwks?.remoteUrl && !options.jwks?.keyPairConfig?.alg) {
		throw new BetterAuthError(
			"jwks_config",
			"must specify alg when using the oidc plugin and jwks.remoteUrl",
		);
	}

	return {
		id: "jwt",
		options,
		endpoints: {
			getJwks: createAuthEndpoint(
				"/jwks",
				{
					method: "GET",
					metadata: {
						openapi: {
							description: "Get the JSON Web Key Set",
							responses: {
								"200": {
									description: "JSON Web Key Set retrieved successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													keys: {
														type: "array",
														description: "Array of public JSON Web Keys",
														items: {
															type: "object",
															properties: {
																kid: {
																	type: "string",
																	description:
																		"Key ID uniquely identifying the key, corresponds to the 'id' from the stored Jwk",
																},
																kty: {
																	type: "string",
																	description:
																		"Key type (e.g., 'RSA', 'EC', 'OKP')",
																},
																alg: {
																	type: "string",
																	description:
																		"Algorithm intended for use with the key (e.g., 'EdDSA', 'RS256')",
																},
																use: {
																	type: "string",
																	description:
																		"Intended use of the public key (e.g., 'sig' for signature)",
																	enum: ["sig"],
																	nullable: true,
																},
																n: {
																	type: "string",
																	description:
																		"Modulus for RSA keys (base64url-encoded)",
																	nullable: true,
																},
																e: {
																	type: "string",
																	description:
																		"Exponent for RSA keys (base64url-encoded)",
																	nullable: true,
																},
																crv: {
																	type: "string",
																	description:
																		"Curve name for elliptic curve keys (e.g., 'Ed25519', 'P-256')",
																	nullable: true,
																},
																x: {
																	type: "string",
																	description:
																		"X coordinate for elliptic curve keys (base64url-encoded)",
																	nullable: true,
																},
																y: {
																	type: "string",
																	description:
																		"Y coordinate for elliptic curve keys (base64url-encoded)",
																	nullable: true,
																},
															},
															required: ["kid", "kty", "alg"],
														},
													},
												},
												required: ["keys"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					// Disables endpoint if using remote url strategy
					if (options?.jwks?.remoteUrl) {
						throw new APIError("NOT_FOUND");
					}

					const adapter = getJwksAdapter(ctx.context.adapter);

					const keySets = await adapter.getAllKeys();

					if (keySets.length === 0) {
						const key = await createJwkOnDb(ctx, options);
						keySets.push(key);
					}

					return ctx.json({
						keys: keySets.map((keySet) => ({
							...JSON.parse(keySet.publicKey),
							kid: keySet.id,
						})),
					});
				},
			),
			getToken: createAuthEndpoint(
				"/token",
				{
					method: "GET",
					requireHeaders: true,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Converts a session cookie to a JWT token",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													token: {
														type: "string",
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
					// Convert context into user payload
					let payload: Record<string, any>;
					if (options?.jwt?.definePayload && ctx.context.session) {
						payload = await options?.jwt.definePayload(ctx.context.session);
					} else {
						payload = ctx.context.session?.user ?? {};
					}

					// Convert into JWT token
					const token = await signJwtPayload(ctx, payload, options);
					return ctx.json({
						token,
					});
				},
			),
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return context.path === "/get-session";
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (options?.disableSettingJwtHeader) {
							return;
						}

						const session = ctx.context.session || ctx.context.newSession;
						if (session && session.session) {
							// Convert context into user payload
							let payload: Record<string, any>;
							if (options?.jwt?.definePayload) {
								payload = await options?.jwt.definePayload(
									ctx.context.session!,
								);
							} else {
								payload = ctx.context.session?.user ?? {};
							}

							if (!payload) return;
							const token = await signJwtPayload(ctx, payload, options);
							const exposedHeaders =
								ctx.context.responseHeaders?.get(
									"access-control-expose-headers",
								) || "";
							const headersSet = new Set(
								exposedHeaders
									.split(",")
									.map((header) => header.trim())
									.filter(Boolean),
							);
							headersSet.add("set-auth-jwt");
							ctx.setHeader("set-auth-jwt", token);
							ctx.setHeader(
								"Access-Control-Expose-Headers",
								Array.from(headersSet).join(", "),
							);
						}
					}),
				},
			],
		},
		schema: mergeSchema(schema, options?.schema),
	} satisfies BetterAuthPlugin;
};
