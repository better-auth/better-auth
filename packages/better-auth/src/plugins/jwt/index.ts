import type {
	AuthContext,
	BetterAuthPlugin,
	GenericEndpointContext,
	HookEndpointContext,
	InferOptionSchema,
	Session,
	User,
} from "../../types";
import { type Jwk, schema } from "./schema";
import { getJwksAdapter } from "./adapter";
import {
	exportJWK,
	generateKeyPair,
	importJWK,
	JWTPayload,
	SignJWT
} from "jose";
import {
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { mergeSchema } from "../../db/schema";
import { BetterAuthError } from "../../error";
import { Awaitable } from "vitest";

type JWKOptions =
	| {
			alg: "EdDSA"; // EdDSA with either Ed25519 or Ed448 curve
			crv?: "Ed25519" | "Ed448";
	  }
	| {
			alg: "ES256"; // ECDSA with P-256 curve
			crv?: never; // Only one valid option, no need for crv
	  }
	| {
			alg: "RS256"; // RSA with SHA-256
			modulusLength?: number; // Default to 2048 or higher
	  }
	| {
			alg: "PS256"; // RSA-PSS with SHA-256
			modulusLength?: number; // Default to 2048 or higher
	  }
	| {
			alg: "ECDH-ES"; // Key agreement algorithm with P-256 as default curve
			crv?: "P-256" | "P-384" | "P-521";
	  }
	| {
			alg: "ES512"; // ECDSA with P-521 curve
			crv?: never; // Only P-521 for ES512
	  };

export interface JwtPluginOptions {
	jwks?: JwksOptions
	jwt?: JwtOptions
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
	usesOidcProviderPlugin?: boolean
}

export interface JwksOptions {
	/**
	 * Disables the /jwks endpoint and uses this endpoint in discovery.
	 *
	 * Useful if jwks are not managed at /jwks or
	 * if your jwks are signed with a certificate and placed on your CDN.
	 */
	remoteUrl?: string
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
	sign?: (payload: JWTPayload) => Awaitable<string>
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
	 * @invalid usesOidcProviderPlugin = true
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
	const plugin: (Omit<BetterAuthPlugin, "options"> & { options?: JwtPluginOptions }) | undefined = ctx.options.plugins?.find(
		(plugin) => plugin.id === "jwt",
	);
	if (!plugin) {
		throw new BetterAuthError('jwt_config', 'jwt plugin not found')
	}
	return plugin;
};

export async function createJwk(
	ctx: GenericEndpointContext,
	options?: JwtPluginOptions,
) {
	if (!options) {
		options = getJwtPlugin(ctx.context).options
	}

	const { publicKey, privateKey } = await generateKeyPair(
		options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
		options?.jwks?.keyPairConfig ?? {
			crv: "Ed25519",
			extractable: true,
		},
	);

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);
	const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	let jwk: Partial<Jwk> = {
		publicKey: JSON.stringify(publicWebKey),
		privateKey: privateKeyEncryptionEnabled
			? JSON.stringify(
					await symmetricEncrypt({
						key: ctx.context.secret,
						data: stringifiedPrivateWebKey,
					}),
				)
			: stringifiedPrivateWebKey,
		createdAt: new Date(),
	};

	const adapter = getJwksAdapter(ctx.context.adapter);
	const key = await adapter.createJwk(jwk as Jwk);

	return key
}

/**
 * Signs a payload in jwt format
 *
 * @param ctx - endpoint context
 * @param payload - payload to sign
 * @param options - Jwt signing options. If not provided, uses the jwtPlugin options
 */
export async function signJwt(
	ctx: GenericEndpointContext,
	payload: JWTPayload,
	options?: JwtPluginOptions,
): Promise<string> {
	if (!options) {
		options = getJwtPlugin(ctx.context).options
	}

	// Custom/remote signing function
	if (options?.jwt?.sign && payload) {
		return options.jwt.sign(payload)
	}

	// Local signing
	const adapter = getJwksAdapter(ctx.context.adapter);

	let key = await adapter.getLatestKey();
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	if (key === undefined) {
		key = await createJwk(ctx, options)
	}

	let privateWebKey = privateKeyEncryptionEnabled
		? await symmetricDecrypt({
				key: ctx.context.secret,
				data: JSON.parse(key.privateKey),
			}).catch(() => {
				throw new BetterAuthError(
					"Failed to decrypt private private key. Make sure the secret currently in use is the same as the one used to encrypt the private key. If you are using a different secret, either cleanup your jwks or disable private key encryption.",
				);
			})
		: key.privateKey;

	const privateKey = await importJWK(
		JSON.parse(privateWebKey),
		options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
	);

	const jwt = new SignJWT(payload)
		.setProtectedHeader({
			alg: options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
			kid: key.id,
			typ: 'JWT',
		})
		.setIssuedAt(payload.iat)
		.setIssuer(
			payload.iss
			?? options?.jwt?.issuer
			?? ctx.context.options.baseURL!
		)
		.setAudience(
			payload.aud
			?? options?.jwt?.audience
			?? ctx.context.options.baseURL!
		)
		.setExpirationTime(
			payload.exp
			?? options?.jwt?.expirationTime
			?? "15m"
		)
	const sub = (await options?.jwt?.getSubject?.(ctx.context.session!)) ??
		payload.sub ??
		ctx.context.session?.user.id
	if (sub) jwt.setSubject(sub)
	return await jwt.sign(privateKey);
}

export const jwt = (options?: JwtPluginOptions) => {
	const endpoints: BetterAuthPlugin['endpoints'] = {}

	// Remote url must be set when using signing function
	if (options?.jwt?.sign && !options.jwks?.remoteUrl) {
		throw new BetterAuthError("jwks_config", "jwks.remoteUrl must be set when using jwt.sign")
	}

	// Alg is required to be specified when using oidc plugin and remote url (needed in openid metadata)
	if (
		options?.usesOidcProviderPlugin &&
		options.jwks?.remoteUrl &&
		!options.jwks?.keyPairConfig?.alg
	) {
		throw new BetterAuthError("jwks_config", "must specify alg when using the oidc plugin and jwks.remoteUrl")
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

				let keySets = await adapter.getAllKeys();

				if (keySets.length === 0) {
					const key = await createJwk(ctx, options)
					keySets.push(key)
				}

				return ctx.json({
					keys: keySets.map((keySet) => ({
						...JSON.parse(keySet.publicKey),
						kid: keySet.id,
					})),
				});
			},
		)
	}

	if (!options?.usesOidcProviderPlugin) {
		endpoints.getToken = createAuthEndpoint(
			"/token",
			{
				method: "GET",
				requireHeaders: true,
				use: [sessionMiddleware],
				metadata: {
					openapi: {
						description: "Converts a session cookie a JWT token",
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
				let payload: Record<string, any>
				if (options?.jwt?.definePayload) {
					payload = await options?.jwt.definePayload(ctx.context.session!)
				} else {
					payload = {
						...ctx.context.session?.user,
						id: undefined // id becomes sub in Sign Function
					}
				}

				// Convert into jwt token
				const jwt = await signJwt(
					ctx,
					payload,
					options,
				);
				return ctx.json({
					token: jwt,
				});
			},
		)
	}

	const getSessionHook = options?.usesOidcProviderPlugin
		? undefined
		: {
			matcher(context: HookEndpointContext) {
				return context.path === "/get-session";
			},
			handler: createAuthMiddleware(async (ctx) => {
				const session = ctx.context.session || ctx.context.newSession;
				if (session && session.session) {
					// Convert context into user payload
					let payload: Record<string, any>
					if (options?.jwt?.definePayload) {
						payload = await options?.jwt.definePayload(ctx.context.session!)
					} else {
						payload = {
							...ctx.context.session?.user,
							id: undefined // id becomes sub in Sign Function
						}
					}

					if (!payload) return
					const jwt = await signJwt(
						ctx,
						payload,
						options,
					)
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
					ctx.setHeader("set-auth-jwt", jwt);
					ctx.setHeader(
						"Access-Control-Expose-Headers",
						Array.from(headersSet).join(", "),
					);
				}
			}),
		}

	return {
		id: "jwt",
		init: (ctx) => {
			// Add the jwt plugin options to ctx
			const plugin = ctx.options.plugins?.find(
				(plugin) => plugin.id === "jwt",
			);
			if (!plugin) {
				throw Error("Plugin should have been register! Should never hit!")
			}
			plugin.options = options
		},
		endpoints,
		hooks: {
			after: getSessionHook ? [ getSessionHook ] : undefined,
		},
		schema: mergeSchema(schema, options?.schema),
	} satisfies BetterAuthPlugin;
};
