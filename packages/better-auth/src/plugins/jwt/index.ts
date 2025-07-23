import type { BetterAuthPlugin, HookEndpointContext } from "../../types";
import { schema } from "./schema";
import { getJwksAdapter } from "./adapter";
import {
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import { mergeSchema } from "../../db/schema";
import { BetterAuthError } from "../../error";
import { createJwk, signJwt } from "./sign";
import type { JwtPluginOptions } from "./types";
export type * from "./types";
export { createJwk, getJwtToken, signJwt } from "./sign";
export { getJwtPlugin } from "./utils";

export const jwt = (options?: JwtPluginOptions) => {
	const endpoints: BetterAuthPlugin["endpoints"] = {};
	const hooks: BetterAuthPlugin["hooks"] = {};

	// Remote url must be set when using signing function
	if (options?.jwt?.sign && !options.jwks?.remoteUrl) {
		throw new BetterAuthError(
			"jwks_config",
			"jwks.remoteUrl must be set when using jwt.sign",
		);
	}

	// Alg is required to be specified when using oidc plugin and remote url (needed in openid metadata)
	if (
		options?.usesOauthProvider &&
		options.jwks?.remoteUrl &&
		!options.jwks?.keyPairConfig?.alg
	) {
		throw new BetterAuthError(
			"jwks_config",
			"must specify alg when using the oidc plugin and jwks.remoteUrl",
		);
	}

	// Disables endpoint if using remote url strategy
	if (!options?.jwks?.remoteUrl) {
		endpoints.getJwks = createAuthEndpoint(
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
				const adapter = getJwksAdapter(ctx.context.adapter);

				const keySets = await adapter.getAllKeys();

				if (keySets.length === 0) {
					const key = await createJwk(ctx, options);
					keySets.push(key);
				}

				return ctx.json({
					keys: keySets.map((keySet) => ({
						...JSON.parse(keySet.publicKey),
						kid: keySet.id,
					})),
				});
			},
		);
	}

	if (!options?.usesOauthProvider) {
		endpoints.getToken = createAuthEndpoint(
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
				if (options?.jwt?.definePayload) {
					payload = await options?.jwt.definePayload(ctx.context.session!);
				} else {
					payload = {
						...ctx.context.session?.user,
						id: undefined, // id becomes sub in Sign Function
					};
				}

				// Convert into JWT token
				const jwt = await signJwt(ctx, payload, options);
				return ctx.json({
					token: jwt,
				});
			},
		);
	}

	if (!options?.usesOauthProvider) {
		if (!hooks.after) hooks.after = [];
		hooks.after.push({
			matcher(context: HookEndpointContext) {
				return context.path === "/get-session";
			},
			handler: createAuthMiddleware(async (ctx) => {
				const session = ctx.context.session || ctx.context.newSession;
				if (session && session.session) {
					// Convert context into user payload
					let payload: Record<string, any>;
					if (options?.jwt?.definePayload) {
						payload = await options?.jwt.definePayload(ctx.context.session!);
					} else {
						payload = {
							...ctx.context.session?.user,
							id: undefined, // id becomes sub in Sign Function
						};
					}

					if (!payload) return;
					const jwt = await signJwt(ctx, payload, options);
					const exposedHeaders =
						ctx.context.responseHeaders?.get("access-control-expose-headers") ||
						"";
					const headersSet = new Set(
						exposedHeaders
							.split(",")
							.map((header) => header.trim())
							.filter(Boolean),
					);
					headersSet.add("set-auth-jwt");
					ctx.setHeader("set-auth-jwt", jwt);
					ctx.setHeader(
						"Access-Control-Expose-Headers",
						Array.from(headersSet).join(", "),
					);
				}
			}),
		});
	}

	return {
		id: "jwt",
		init: (ctx) => {
			// Add the jwt plugin options to ctx
			const plugin = ctx.options.plugins?.find((plugin) => plugin.id === "jwt");
			if (!plugin) {
				throw Error("Plugin should have been registered! Should never hit!");
			}
			plugin.options = options;
		},
		endpoints,
		hooks,
		schema: mergeSchema(schema, options?.schema),
	} satisfies BetterAuthPlugin;
};
