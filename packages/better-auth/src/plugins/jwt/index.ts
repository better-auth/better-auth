import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { BetterAuthError } from "@better-auth/core/error";
import type { JSONWebKeySet, JWTPayload } from "jose";
import * as z from "zod";
import { APIError, sessionMiddleware } from "../../api";
import { mergeSchema } from "../../db/schema";
import { PACKAGE_VERSION } from "../../version";
import { getDefaultKeyAlg, getJwksAdapter } from "./adapter";
import { createCookieCacheSigner } from "./cookie-cache";
import { schema } from "./schema";
import { getJwtToken, signJWT } from "./sign";
import type { JWSAlgorithms, JwtOptions } from "./types";
import { createJwk } from "./utils";
import { verifyJWT as verifyJWTHelper } from "./verify";

export { resolveSigningKey, signJWT } from "./sign";
export type * from "./types";
export { createJwk, generateExportedKeyPair, toExpJWT } from "./utils";
export { verifyJWT } from "./verify";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		jwt: {
			creator: typeof jwt;
		};
	}
}

const jwsAlgorithms = [
	"EdDSA",
	"ES256",
	"ES512",
	"PS256",
	"RS256",
] as const satisfies readonly JWSAlgorithms[];

const signJWTBodySchema = z.object({
	payload: z.record(z.string(), z.any()),
	overrideOptions: z.record(z.string(), z.any()).optional(),
	// Strict so key-locating and parsing members (`alg`, `kid`, `jku`, `x5u`,
	// `jwk`, `b64`, `crit`) are rejected rather than signed into the header.
	header: z
		.strictObject({
			typ: z.string().min(1).optional(),
			cty: z.string().min(1).optional(),
		})
		.optional(),
	signingKeyId: z.string().min(1).optional(),
	signingAlgorithm: z.enum(jwsAlgorithms).optional(),
});

const verifyJWTBodySchema = z.object({
	token: z.string(),
	issuer: z.string().optional(),
});

export const jwt = <O extends JwtOptions>(options?: O) => {
	// Remote url must be set when using signing function
	if (options?.jwt?.sign && !options.jwks?.remoteUrl) {
		throw new BetterAuthError(
			"options.jwks.remoteUrl must be set when using options.jwt.sign",
		);
	}

	// Alg is required to be specified when using remote url (needed in openid metadata)
	if (options?.jwks?.remoteUrl && !options.jwks?.keyPairConfig?.alg) {
		throw new BetterAuthError(
			"options.jwks.keyPairConfig.alg must be specified when options.jwks.remoteUrl is used for OpenID metadata",
		);
	}

	const jwksPath = options?.jwks?.jwksPath ?? "/jwks";
	if (
		typeof jwksPath !== "string" ||
		jwksPath.length === 0 ||
		!jwksPath.startsWith("/") ||
		jwksPath.includes("..")
	) {
		throw new BetterAuthError(
			"options.jwks.jwksPath must be a non-empty string starting with '/' and not contain '..'",
		);
	}

	return {
		id: "jwt",
		version: PACKAGE_VERSION,
		options: options as NoInfer<O>,
		init(ctx) {
			if (!options?.sessionCookieCache) {
				return;
			}

			if (ctx.options.session?.cookieCache?.strategy !== "jwt") {
				throw new BetterAuthError(
					'`jwt({ sessionCookieCache: true })` requires `session.cookieCache.strategy = "jwt"`.',
				);
			}

			if (options.jwt?.sign) {
				throw new BetterAuthError(
					"`jwt({ sessionCookieCache: true })` requires locally managed JWT plugin keys and does not support `jwt.sign`.",
				);
			}

			const gracePeriod = options.jwks?.gracePeriod;
			const cookieMaxAge = ctx.options.session.cookieCache.maxAge || 60 * 5;
			if (gracePeriod !== undefined && cookieMaxAge > gracePeriod) {
				ctx.logger.warn(
					`[better-auth] \`session.cookieCache.maxAge\` (${cookieMaxAge}s) exceeds the JWT plugin JWKS grace period (${gracePeriod}s). Rotated keys may stop verifying cookie-cache JWTs before the cookie expires.`,
				);
			}

			return {
				context: {
					sessionConfig: {
						...ctx.sessionConfig,
						cookieCacheSigner: createCookieCacheSigner(options),
					},
				},
			};
		},
		endpoints: {
			getJwks: createAuthEndpoint(
				jwksPath,
				{
					method: "GET",
					metadata: {
						openapi: {
							operationId: "getJSONWebKeySet",
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

					const adapter = getJwksAdapter(ctx.context.adapter, options);

					let keySets = await adapter.getAllKeys(ctx);

					if (!keySets || keySets?.length === 0) {
						await createJwk(ctx, options);
						keySets = await adapter.getAllKeys(ctx);
					}

					if (!keySets?.length) {
						throw new BetterAuthError(
							"No key sets found. Make sure you have a key in your database.",
						);
					}

					const now = Date.now();
					const DEFAULT_GRACE_PERIOD = 60 * 60 * 24 * 30;
					const gracePeriod =
						(options?.jwks?.gracePeriod ?? DEFAULT_GRACE_PERIOD) * 1000;

					const keys = keySets.filter((key) => {
						if (!key.expiresAt) {
							return true;
						}
						return key.expiresAt.getTime() + gracePeriod > now;
					});

					const keyPairConfig = options?.jwks?.keyPairConfig;
					const defaultCrv = keyPairConfig
						? "crv" in keyPairConfig
							? (keyPairConfig as { crv: string }).crv
							: undefined
						: undefined;
					return ctx.json({
						keys: keys.map((keySet) => {
							return {
								alg: keySet.alg ?? getDefaultKeyAlg(options),
								crv: keySet.crv ?? defaultCrv,
								...JSON.parse(keySet.publicKey),
								kid: keySet.id,
							};
						}),
					} satisfies JSONWebKeySet as JSONWebKeySet);
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
							operationId: "getJSONWebToken",
							description: "Get a JWT token",
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
					const jwt = await getJwtToken(ctx, options);
					return ctx.json({
						token: jwt,
					});
				},
			),
			signJWT: createAuthEndpoint.serverOnly(
				{
					method: "POST",
					metadata: {
						$Infer: {
							body: {} as {
								payload: JWTPayload;
								/**
								 * Protected header members to add. `alg` and `kid` always
								 * come from the signing key.
								 */
								header?:
									| {
											/**
											 * Media type of the token, such as `"logout+jwt"`.
											 *
											 * @see https://www.rfc-editor.org/rfc/rfc8725#section-3.11
											 */
											typ?: string | undefined;
											/** Content type of the payload. */
											cty?: string | undefined;
									  }
									| undefined;
								/**
								 * Sign with the JWKS key whose `id` (the `kid` header) matches.
								 * Throws when no such key exists.
								 */
								signingKeyId?: string | undefined;
								/**
								 * Sign with the newest unexpired key of this algorithm. A key
								 * is created on first use only when the algorithm is
								 * `jwks.keyPairConfig.alg` or listed in `jwks.keyPairConfigs`;
								 * otherwise the call throws.
								 */
								signingAlgorithm?: JWSAlgorithms | undefined;
								/**
								 * Replaces each top-level option group it sets (such as `jwks`
								 * or `jwt`) for this call. Prefer `signingAlgorithm` to choose
								 * the algorithm.
								 */
								overrideOptions?: JwtOptions | undefined;
							},
						},
					},
					body: signJWTBodySchema,
				},
				async (c) => {
					const jwt = await signJWT(c, {
						options: {
							...options,
							...c.body.overrideOptions,
						},
						payload: c.body.payload,
						header: c.body.header,
						signingKeyId: c.body.signingKeyId,
						signingAlgorithm: c.body.signingAlgorithm,
					});
					return c.json({ token: jwt });
				},
			),
			verifyJWT: createAuthEndpoint.serverOnly(
				{
					method: "POST",
					metadata: {
						$Infer: {
							body: {} as {
								token: string;
								issuer?: string;
							},
							response: {} as {
								payload: {
									sub: string;
									aud: string;
									[key: string]: any;
								} | null;
							},
						},
					},
					body: verifyJWTBodySchema,
				},
				async (ctx) => {
					const overrideOptions = ctx.body.issuer
						? {
								...options,
								jwt: {
									...options?.jwt,
									issuer: ctx.body.issuer,
								},
							}
						: options;

					const payload = await verifyJWTHelper(
						ctx.body.token,
						overrideOptions,
					);

					return ctx.json({ payload });
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
							const jwt = await getJwtToken(ctx, options);
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
				},
			],
		},
		schema: mergeSchema(schema, options?.schema),
	} satisfies BetterAuthPlugin;
};

export { getJwtToken };
