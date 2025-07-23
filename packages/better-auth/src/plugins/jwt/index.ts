import type {
	AuthContext,
	BetterAuthPlugin,
	HookEndpointContext,
	InferOptionSchema,
	Session,
	User,
} from "../../types";
import { schema } from "./schema";
import { getJwksAdapter } from "./adapter";
import type { JWTPayload } from "jose";
import {
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import { mergeSchema } from "../../db/schema";
import { BetterAuthError } from "../../error";
import type { Awaitable } from "../../types/helper";
import { createJwk, signJwt } from "./sign";
export { createJwk, signJwt, getJwtToken } from "./sign";

// Asymmetric (JWS) Supported (https://github.com/panva/jose/issues/210)
export type JWKOptions =
	| {
			alg: "EdDSA"; // EdDSA with Ed25519 key
			crv?: "Ed25519";
	  }
	| {
			alg: "ES256"; // ECDSA with P-256 curve
			crv?: never; // Only one valid option, no need for crv
	  }
	| {
			alg: "ES512"; // ECDSA with P-521 curve
			crv?: never; // Only P-521 for ES512
	  }
	| {
			alg: "PS256"; // RSA-PSS with SHA-256
			modulusLength?: number; // Default to 2048 or higher
	  }
	| {
			alg: "RS256"; // RSA with SHA-256
			modulusLength?: number; // Default to 2048 or higher
	  };

export type JWSAlgorithms = JWKOptions["alg"];

export interface JwtPluginOptions {
	jwks?: JwksOptions;
	jwt?: JwtOptions;
	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<typeof schema>;
	/**
	 * Disables /token endpoint and auth middleware
	 * in favor of Oidc authentication strategy.
	 *
	 * Thus, only the /jwks endpoint is enabled.
	 */
	usesOauthProvider?: boolean;
}

export interface JwksOptions {
	/**
	 * Disables the /jwks endpoint and uses this endpoint in discovery.
	 *
	 * Useful if jwks are not managed at /jwks or
	 * if your jwks are signed with a certificate and placed on your CDN.
	 */
	remoteUrl?: string;
	/**
	 * Key pair configuration
	 * @description A subset of the options available for the generateKeyPair function
	 *
	 * @see https://github.com/panva/jose/blob/main/src/runtime/node/generate.ts
	 *
	 * @default { alg: 'EdDSA', crv: 'Ed25519' }
	 */
	keyPairConfig?: JWKOptions;
	/**
	 * Disable private key encryption
	 * @description Disable the encryption of the private key in the database
	 *
	 * @default false
	 */
	disablePrivateKeyEncryption?: boolean;
}

export interface JwtOptions {
	/**
	 * A custom function to remote sign the jwt payload.
	 *
	 * All headers, such as `alg` and `kid`,
	 * MUST be defined within this function.
	 * You can safely define the header `typ: 'JWT'`.
	 *
	 * @requires jwks.remoteUrl
	 * @invalidates other jwt.* options
	 */
	sign?: (payload: JWTPayload) => Awaitable<string>;
	/**
	 * The issuer of the JWT
	 */
	issuer?: string;
	/**
	 * The audience of the JWT
	 */
	audience?: string | string[];
	/**
	 * Set the "exp" (Expiration Time) Claim.
	 *
	 * - If a `number` is passed as an argument it is used as the claim directly.
	 * - If a `Date` instance is passed as an argument it is converted to unix timestamp and used as the
	 *   claim.
	 * - If a `string` is passed as an argument it is resolved to a time span, and then added to the
	 *   current unix timestamp and used as the claim.
	 *
	 * Format used for time span should be a number followed by a unit, such as "5 minutes" or "1
	 * day".
	 *
	 * Valid units are: "sec", "secs", "second", "seconds", "s", "minute", "minutes", "min", "mins",
	 * "m", "hour", "hours", "hr", "hrs", "h", "day", "days", "d", "week", "weeks", "w", "year",
	 * "years", "yr", "yrs", and "y". It is not possible to specify months. 365.25 days is used as an
	 * alias for a year.
	 *
	 * If the string is suffixed with "ago", or prefixed with a "-", the resulting time span gets
	 * subtracted from the current unix timestamp. A "from now" suffix can also be used for
	 * readability when adding to the current unix timestamp.
	 *
	 * @default 15m
	 */
	expirationTime?: number | string | Date;
	/**
	 * A function that is called to define the payload of the JWT
	 *
	 * @invalid usesOauthProvider = true
	 */
	definePayload?: (session: {
		user: User & Record<string, any>;
		session: Session & Record<string, any>;
	}) => Promise<Record<string, any>> | Record<string, any>;
	/**
	 * A function that is called to get the subject of the JWT
	 *
	 * @default session.user.id
	 */
	getSubject?: (session: {
		user: User & Record<string, any>;
		session: Session & Record<string, any>;
	}) => Promise<string> | string;
}

export const getJwtPlugin = (ctx: AuthContext) => {
	const plugin:
		| (Omit<BetterAuthPlugin, "options"> & { options?: JwtPluginOptions })
		| undefined = ctx.options.plugins?.find((plugin) => plugin.id === "jwt");
	if (!plugin) {
		throw new BetterAuthError("jwt_config", "jwt plugin not found");
	}
	return plugin;
};

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
