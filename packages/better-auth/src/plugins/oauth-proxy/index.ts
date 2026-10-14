import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	SecretConfig,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { AccountKey } from "@better-auth/core/db";
import { accountSchema, userSchema } from "@better-auth/core/db";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { managedNonce, utf8ToBytes } from "@noble/ciphers/utils.js";
import { defu } from "defu";
import * as z from "zod";
import { originCheck } from "../../api";
import { setOAuthState } from "../../api/state/oauth";
import { parseJSON } from "../../client/parser";
import { setSessionCookie } from "../../cookies";
import { parseSetCookieHeader } from "../../cookies/cookie-utils";
import {
	formatEnvelope,
	parseEnvelope,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import type { EncryptionPurpose } from "../../crypto/purpose";
import { derivePurposeKey } from "../../crypto/purpose";
import {
	resolveOAuthAccountKey,
	toOAuthProfileRecord,
} from "../../oauth2/account-key";
import { redirectOnError } from "../../oauth2/errors";
import {
	handleOAuthUserInfo,
	linkOAuthAccount,
} from "../../oauth2/link-account";
import { getOAuthCallbackPath } from "../../oauth2/utils";
import {
	getAuthStateVerificationIdentifier,
	parseGenericState,
} from "../../state";
import { isAPIError } from "../../utils/is-api-error";
import { getOrigin } from "../../utils/url";
import { PACKAGE_VERSION } from "../../version";
import { checkSkipProxy, resolveCurrentURL, stripTrailingSlash } from "./utils";

const stateDataSchema = z.looseObject({
	callbackURL: z.string(),
	codeVerifier: z.string(),
	errorURL: z.string().optional(),
	newUserURL: z.string().optional(),
	expiresAt: z.number(),
	oauthState: z.string().optional(),
	link: z
		.object({
			email: z.string(),
			userId: z.coerce.string(),
		})
		.optional(),
	requestSignUp: z.boolean().optional(),
	idTokenNonce: z.string().optional(),
	serverContext: z.record(z.string(), z.unknown()).optional(),
});

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"oauth-proxy": {
			creator: typeof oAuthProxy;
		};
	}
}

export interface OAuthProxyOptions {
	/**
	 * The current URL of the application.
	 * The plugin will attempt to infer the current URL from your environment
	 * by checking the base URL from popular hosting providers,
	 * from the request URL if invoked by a client,
	 * or as a fallback, from the `baseURL` in your auth config.
	 * If the URL is not inferred correctly, you can provide a value here."
	 */
	currentURL?: string | undefined;
	/**
	 * If a request in a production url it won't be proxied.
	 *
	 * default to `BETTER_AUTH_URL`
	 */
	productionURL?: string | undefined;
	/**
	 * Maximum age in seconds for the encrypted payload.
	 * Payloads older than this will be rejected to prevent replay attacks.
	 *
	 * Keep this value short (e.g., 30-60 seconds) to minimize the window
	 * for potential replay attacks while still allowing normal OAuth flows.
	 *
	 * @default 60 (1 minute)
	 */
	maxAge?: number | undefined;
	/**
	 * A dedicated secret used to encrypt and decrypt data passed between
	 * servers during the OAuth proxy flow.
	 *
	 * When set, keys derived from this secret are used **instead of** keys
	 * derived from `BETTER_AUTH_SECRET` for OAuth proxy encryption.
	 * This limits exposure of data protected only by the main secret if
	 * the proxy secret is shared across environments (production, preview,
	 * development). A compromised proxy secret can still affect OAuth flows.
	 *
	 * All environments participating in the OAuth proxy flow must share
	 * the same `secret` value.
	 */
	secret?: string | SecretConfig | undefined;
}

/**
 * State package for cross-origin OAuth proxy flow.
 *
 * In compact packages (`ba_c.`), `stateCookie` holds the plaintext `StateData` JSON string,
 * which is confidential and authenticated via the single outer AEAD encryption envelope.
 *
 * In legacy packages, `stateCookie` holds the inner ciphertext encrypted under the
 * `oauth-proxy-state` purpose key.
 * @internal
 */
export type OAuthProxyStatePackage = {
	state: string;
	/**
	 * In compact packages (`ba_c.`), holds the plaintext `StateData` JSON string,
	 * protected by the single outer AEAD envelope.
	 * In legacy packages, holds the inner ciphertext encrypted under the `oauth-proxy-state`
	 * purpose key.
	 */
	stateCookie: string;
	isOAuthProxy: boolean;
};

const COMPACT_STATE_PREFIX = "ba_c.";
const MAX_DECOMPRESSED_BYTES = 64 * 1024; // 64 KB ceiling

const deflateBytes = async (data: Uint8Array): Promise<Uint8Array> => {
	if (typeof CompressionStream !== "undefined") {
		const cs = new CompressionStream("deflate-raw");
		const writer = cs.writable.getWriter();
		await writer.write(data as unknown as BufferSource);
		await writer.close();
		return new Uint8Array(await new Response(cs.readable).arrayBuffer());
	}
	try {
		const zlib = await import("node:zlib");
		if (typeof zlib.deflateRawSync === "function") {
			const deflated = zlib.deflateRawSync(data);
			return new Uint8Array(
				deflated.buffer,
				deflated.byteOffset,
				deflated.byteLength,
			);
		}
	} catch {
		// node:zlib unavailable in this runtime
	}
	throw new Error("No compression stream or zlib implementation available");
};

const inflateBytes = async (data: Uint8Array): Promise<Uint8Array | null> => {
	if (typeof DecompressionStream !== "undefined") {
		try {
			const ds = new DecompressionStream("deflate-raw");
			const writer = ds.writable.getWriter();
			const writePromise = (async () => {
				try {
					await writer.write(data as unknown as BufferSource);
					await writer.close();
				} catch {
					// DecompressionStream may reject/abort on invalid input
				}
			})();
			const reader = ds.readable.getReader();
			const chunks: Uint8Array[] = [];
			let totalLength = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				totalLength += value.byteLength;
				if (totalLength > MAX_DECOMPRESSED_BYTES) {
					try {
						await reader.cancel();
					} catch {
						// Ignore cancellation error
					}
					return null;
				}
				chunks.push(value);
			}
			await writePromise;
			const result = new Uint8Array(totalLength);
			let offset = 0;
			for (const chunk of chunks) {
				result.set(chunk, offset);
				offset += chunk.byteLength;
			}
			return result;
		} catch {
			return null;
		}
	}
	try {
		const zlib = await import("node:zlib");
		if (typeof zlib.inflateRawSync === "function") {
			const inflated = zlib.inflateRawSync(data, {
				maxOutputLength: MAX_DECOMPRESSED_BYTES,
			});
			return new Uint8Array(
				inflated.buffer,
				inflated.byteOffset,
				inflated.byteLength,
			);
		}
	} catch {
		// Decompression failed, exceeded limit, or node:zlib unavailable
		return null;
	}
	return null;
};

const encryptRawBytes = async (
	secret: string,
	data: Uint8Array,
): Promise<Uint8Array> => {
	const keyAsBytes = await createHash("SHA-256").digest(secret);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return chacha.encrypt(data);
};

const decryptRawBytes = async (
	secret: string,
	ciphertext: Uint8Array,
): Promise<Uint8Array> => {
	const keyAsBytes = await createHash("SHA-256").digest(secret);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return chacha.decrypt(ciphertext);
};

/** @internal */
export const packCompactState = async (
	key: string | SecretConfig,
	payload: OAuthProxyStatePackage,
): Promise<string> => {
	const jsonBytes = utf8ToBytes(JSON.stringify(payload));
	const compressed = await deflateBytes(jsonBytes);
	if (typeof key === "string") {
		const ciphertext = await encryptRawBytes(key, compressed);
		return `${COMPACT_STATE_PREFIX}${base64Url.encode(ciphertext, {
			padding: false,
		})}`;
	}
	const secret = key.keys.get(key.currentVersion);
	if (!secret) {
		throw new Error(`Secret version ${key.currentVersion} not found in keys`);
	}
	const ciphertext = await encryptRawBytes(secret, compressed);
	const encoded = base64Url.encode(ciphertext, { padding: false });
	return `${COMPACT_STATE_PREFIX}${formatEnvelope(key.currentVersion, encoded)}`;
};

/** @internal */
export const unpackCompactState = async (
	key: string | SecretConfig,
	data: string,
): Promise<OAuthProxyStatePackage | null> => {
	if (!data.startsWith(COMPACT_STATE_PREFIX)) {
		return null;
	}
	const payload = data.slice(COMPACT_STATE_PREFIX.length);
	try {
		let decryptedBytes: Uint8Array;
		if (typeof key === "string") {
			const cipherBytes = base64Url.decode(payload);
			decryptedBytes = await decryptRawBytes(key, cipherBytes);
		} else {
			const envelope = parseEnvelope(payload);
			if (envelope) {
				const secret = key.keys.get(envelope.version);
				if (!secret) {
					return null;
				}
				const cipherBytes = base64Url.decode(envelope.ciphertext);
				decryptedBytes = await decryptRawBytes(secret, cipherBytes);
			} else if (key.legacySecret) {
				const cipherBytes = base64Url.decode(payload);
				decryptedBytes = await decryptRawBytes(key.legacySecret, cipherBytes);
			} else {
				return null;
			}
		}
		const decompressed = await inflateBytes(decryptedBytes);
		if (!decompressed) {
			return null;
		}
		return parseJSON<OAuthProxyStatePackage>(
			new TextDecoder().decode(decompressed),
		);
	} catch {
		return null;
	}
};

/**
 * Passthrough payload containing OAuth profile data.
 * Used to transfer OAuth credentials from production to preview
 * without creating user/session on production.
 * @internal
 */
const passthroughPayloadSchema = z.looseObject({
	userInfo: z.looseObject(
		userSchema.omit({ createdAt: true, updatedAt: true }).shape,
	),
	account: z.looseObject(
		accountSchema.omit({
			id: true,
			userId: true,
			createdAt: true,
			updatedAt: true,
		}).shape,
	),
	profile: z.record(z.string(), z.unknown()).optional(),
	scopes: z.array(z.string()).optional(),
	state: z.string().min(1),
	callbackURL: z.string().min(1),
	newUserURL: z.string().optional(),
	errorURL: z.string().optional(),
	disableSignUp: z.boolean().optional(),
	timestamp: z.number(),
});

type PassthroughPayload = z.infer<typeof passthroughPayloadSchema>;

const restoreOAuthProxyState = async (
	ctx: GenericEndpointContext,
	state: string,
) => {
	try {
		const stateData = await parseGenericState(ctx, state, {
			skipStateCookieCheck: true,
		});
		await setOAuthState(stateData);
		return stateData;
	} catch (e) {
		ctx.context.logger.warn("OAuth proxy state missing or invalid", e);
		return null;
	}
};

const oauthProxyQuerySchema = z.object({
	callbackURL: z.string().meta({
		description: "The URL to redirect to after the proxy",
	}),
	profile: z.string().optional().meta({
		description: "Encrypted OAuth profile data",
	}),
});

const oauthCallbackQuerySchema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
	user: z.string().optional(),
});

export const oAuthProxy = <O extends OAuthProxyOptions>(opts?: O) => {
	const maxAge = opts?.maxAge ?? 60; // Default 60 seconds
	const getEncryptionKey = (
		ctx: GenericEndpointContext,
		purpose: EncryptionPurpose,
	): string | SecretConfig =>
		derivePurposeKey(opts?.secret ?? ctx.context.secretConfig, purpose);

	const oauthProxyCompletion = createAuthEndpoint(
		"/callback/:id/oauth-proxy",
		{
			method: "GET",
			operationId: "oauthProxyCompletion",
			query: oauthProxyQuerySchema,
			use: [originCheck((ctx) => ctx.query.callbackURL)],
			metadata: {
				scope: "http",
			},
		},
		async (ctx) => {
			const baseURLStr =
				typeof ctx.context.options.baseURL === "string"
					? ctx.context.options.baseURL
					: getOrigin(ctx.context.baseURL) || "";
			const defaultErrorURL =
				ctx.context.options.onAPIError?.errorURL ||
				`${stripTrailingSlash(baseURLStr)}/api/auth/error`;

			const encryptedProfile = ctx.query.profile;
			if (!encryptedProfile) {
				ctx.context.logger.error("OAuth proxy callback missing profile data");
				throw redirectOnError(ctx, defaultErrorURL, "missing_profile");
			}

			// Decrypt profile payload
			let decryptedPayload: string;
			try {
				decryptedPayload = await symmetricDecrypt({
					key: getEncryptionKey(ctx, "oauth-proxy-profile"),
					data: encryptedProfile,
				});
			} catch (e) {
				ctx.context.logger.error("Failed to decrypt OAuth proxy profile", e);
				throw redirectOnError(ctx, defaultErrorURL, "invalid_profile");
			}

			let payload: PassthroughPayload;
			try {
				payload = passthroughPayloadSchema.parse(parseJSON(decryptedPayload));
			} catch (e) {
				ctx.context.logger.error("Failed to parse OAuth proxy payload", e);
				throw redirectOnError(ctx, defaultErrorURL, "invalid_payload");
			}

			const errorURL = payload.errorURL || defaultErrorURL;
			if (
				ctx.path?.startsWith("/callback/") &&
				ctx.params.id !== payload.account.providerId
			) {
				ctx.context.logger.warn("OAuth proxy callback provider mismatch");
				throw redirectOnError(ctx, errorURL, "provider_mismatch");
			}

			// Allow up to 10 seconds of future skew for clock skew
			const now = Date.now();
			const age = (now - payload.timestamp) / 1000;
			if (age > maxAge || age < -10) {
				ctx.context.logger.error(
					`OAuth proxy payload expired or invalid (age: ${age}s, maxAge: ${maxAge}s)`,
				);
				throw redirectOnError(ctx, errorURL, "payload_expired");
			}

			const stateData = await restoreOAuthProxyState(ctx, payload.state);
			if (!stateData) {
				throw redirectOnError(ctx, errorURL, "state_mismatch");
			}
			if (stateData.link) {
				const linkResult = await linkOAuthAccount(ctx, {
					link: stateData.link,
					userInfo: payload.userInfo,
					account: payload.account,
					profile: payload.profile ?? {},
					scopes: payload.scopes ?? payload.account.scope?.split(","),
				});
				if (!linkResult.linked) {
					throw redirectOnError(
						ctx,
						errorURL,
						linkResult.error.code,
						linkResult.error.message,
					);
				}
				throw ctx.redirect(payload.callbackURL);
			}
			let result: Awaited<ReturnType<typeof handleOAuthUserInfo>>;
			try {
				result = await handleOAuthUserInfo(ctx, {
					userInfo: payload.userInfo,
					account: payload.account,
					callbackURL: payload.callbackURL,
					disableSignUp: payload.disableSignUp,
					source: {
						method: "oauth",
						oauth: {
							providerId: payload.account.providerId,
							profile: payload.profile,
						},
					},
				});
			} catch (e) {
				if (isAPIError(e) && e.body?.code) {
					throw redirectOnError(ctx, errorURL, e.body.code, e.body.message);
				}
				throw e;
			}
			if (result.error) {
				ctx.context.logger.error("OAuth proxy callback error", result.error);
				throw redirectOnError(ctx, errorURL, result.error.split(" ").join("_"));
			}
			if (!result.data) {
				ctx.context.logger.error("OAuth proxy callback missing session data");
				throw redirectOnError(ctx, errorURL, "user_creation_failed");
			}

			await setSessionCookie(ctx, result.data);

			// Redirect to final callback URL
			const finalURL = result.isRegister
				? payload.newUserURL || payload.callbackURL
				: payload.callbackURL;

			throw ctx.redirect(finalURL);
		},
	);

	return {
		id: "oauth-proxy",
		version: PACKAGE_VERSION,
		options: opts as NoInfer<O>,
		endpoints: {
			/**
			 * @deprecated OAuth proxy callbacks now use `/callback/:id/oauth-proxy`.
			 * This endpoint will be removed in the next minor release.
			 */
			oAuthProxy: createAuthEndpoint(
				"/oauth-proxy-callback",
				{
					method: "GET",
					operationId: "oauthProxyCallback",
					query: oauthProxyQuerySchema,
					use: [originCheck((ctx) => ctx.query.callbackURL)],
					metadata: {
						openapi: {
							operationId: "oauthProxyCallback",
							deprecated: true,
							description: "OAuth Proxy Callback",
							parameters: [
								{
									in: "query",
									name: "callbackURL",
									required: true,
									description: "The URL to redirect to after the proxy",
								},
								{
									in: "query",
									name: "profile",
									required: false,
									description: "Encrypted OAuth profile data",
								},
							],
							responses: {
								302: {
									description: "Redirect",
									headers: {
										Location: {
											description: "The URL to redirect to",
											schema: {
												type: "string",
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) =>
					oauthProxyCompletion({
						...ctx,
						params: { id: "oauth-proxy" },
					}),
			),
			oAuthProxyCompletion: oauthProxyCompletion,
		},
		hooks: {
			before: [
				{
					matcher(context) {
						return (
							!!context.path?.startsWith("/sign-in/social") ||
							context.path === "/link-social"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const skipProxy = checkSkipProxy(ctx, opts);
						if (skipProxy) {
							return;
						}

						const providerId = ctx.body?.provider;
						if (!providerId) {
							return;
						}

						const currentURL = resolveCurrentURL(ctx, opts);
						const productionURL = opts?.productionURL;
						const originalCallbackURL =
							ctx.body?.callbackURL || ctx.context.baseURL;

						// Override baseURL to production so redirect_uri points to production
						// This ensures OAuth provider callbacks go to the production server
						if (productionURL) {
							const productionBaseURL = `${stripTrailingSlash(productionURL)}${ctx.context.options.basePath || "/api/auth"}`;
							ctx.context.baseURL = productionBaseURL;
						}

						// Construct proxy callback URL
						const newCallbackURL = `${stripTrailingSlash(currentURL.origin)}${
							ctx.context.options.basePath || "/api/auth"
						}/callback/${providerId}/oauth-proxy?callbackURL=${encodeURIComponent(
							originalCallbackURL,
						)}`;

						ctx.body.callbackURL = newCallbackURL;
					}),
				},
				{
					// Intercept OAuth callback on production to handle passthrough
					matcher(context) {
						return context.path === "/callback/:id";
					},
					handler: createAuthMiddleware(async (ctx) => {
						// Query takes precedence over body (matches callbackOAuth behavior)
						const callbackParams = defu(ctx.query, ctx.body);

						const state = callbackParams.state;
						if (!state || typeof state !== "string") {
							return;
						}

						// Try to decrypt and parse OAuth proxy state package (compact or legacy format)
						let statePackage: OAuthProxyStatePackage | undefined;
						let isCompact = false;
						try {
							const compact = await unpackCompactState(
								getEncryptionKey(ctx, "oauth-proxy-package"),
								state,
							);
							if (compact) {
								statePackage = compact;
								isCompact = true;
							} else {
								const decryptedPackage = await symmetricDecrypt({
									key: getEncryptionKey(ctx, "oauth-proxy-package"),
									data: state,
								});
								statePackage =
									parseJSON<OAuthProxyStatePackage>(decryptedPackage);
							}
						} catch {
							// State is either a regular (non-proxy) state, or an encrypted proxy
							// package that can't be decrypted (e.g. different secrets on preview vs production).
							// If you're using oauth-proxy and seeing state_mismatch errors, ensure all
							// environments share the same `secret` in the oAuthProxy plugin options.
							ctx.context.logger.debug(
								"OAuth proxy: could not decrypt state package, falling back to regular callback",
							);
							return;
						}

						if (
							!statePackage.isOAuthProxy ||
							!statePackage.state ||
							!statePackage.stateCookie
						) {
							ctx.context.logger.warn("Invalid OAuth proxy state package");
							return;
						}

						const query = oauthCallbackQuerySchema.safeParse(callbackParams);
						if (!query.success) {
							ctx.context.logger.warn(
								"Invalid OAuth callback query",
								query.error,
							);
							return;
						}
						const { code, error, user: userData } = query.data;

						// Restore state to get codeVerifier and callbackURL
						// If compact, parse stateCookie directly; if legacy, decrypt with purpose "oauth-proxy-state"
						let rawStateData: unknown;
						try {
							if (isCompact) {
								rawStateData = parseJSON(statePackage.stateCookie);
							} else {
								const decryptedState = await symmetricDecrypt({
									key: getEncryptionKey(ctx, "oauth-proxy-state"),
									data: statePackage.stateCookie,
								});
								rawStateData = parseJSON(decryptedState);
							}
						} catch (e) {
							ctx.context.logger.error(
								"Failed to decrypt OAuth proxy state cookie:",
								e,
							);
							return;
						}

						const validatedState = stateDataSchema.safeParse(rawStateData);
						if (!validatedState.success) {
							ctx.context.logger.warn(
								"OAuth proxy state data validation failed",
								validatedState.error,
							);
							return;
						}
						const stateData = validatedState.data;

						const errorURL =
							stateData.errorURL ||
							ctx.context.options.onAPIError?.errorURL ||
							`${ctx.context.baseURL}/error`;

						if (
							stateData.oauthState !== undefined &&
							stateData.oauthState !== statePackage.state
						) {
							ctx.context.logger.error("OAuth proxy state binding mismatch");
							throw redirectOnError(ctx, errorURL, "state_mismatch");
						}

						if (error) {
							throw redirectOnError(ctx, errorURL, error);
						}

						if (!code) {
							ctx.context.logger.warn(
								"OAuth callback missing authorization code",
							);
							throw redirectOnError(ctx, errorURL, "no_code");
						}

						// Find the OAuth provider
						const providerId = ctx.params?.id;
						const provider = ctx.context.socialProviders.find(
							(p) => p.id === providerId,
						);
						if (!provider) {
							ctx.context.logger.warn("OAuth provider not found", {
								providerId,
							});
							throw redirectOnError(ctx, errorURL, "oauth_provider_not_found");
						}

						// Exchange code for tokens
						let tokens: OAuth2Tokens | null;
						try {
							tokens = await provider.validateAuthorizationCode({
								code,
								codeVerifier: stateData.codeVerifier,
								redirectURI: `${ctx.context.baseURL}${getOAuthCallbackPath(provider)}`,
							});
						} catch (e) {
							ctx.context.logger.error(
								"Failed to validate authorization code",
								e,
							);
							throw redirectOnError(ctx, errorURL, "invalid_code");
						}

						if (!tokens) {
							throw redirectOnError(ctx, errorURL, "invalid_code");
						}

						const parsedUserData = userData
							? safeJSONParse<{
									name?: {
										firstName?: string;
										lastName?: string;
									};
									email?: string;
								}>(userData)
							: null;

						// Get user info from provider
						const userInfoResult = await provider.getUserInfo({
							...tokens,
							/**
							 * The user object from the provider
							 * This is only available for some providers like Apple
							 */
							user: parsedUserData ?? undefined,
						});
						const userInfo = userInfoResult?.user;

						if (!userInfo) {
							ctx.context.logger.error("Unable to get user info from provider");
							throw redirectOnError(ctx, errorURL, "unable_to_get_user_info");
						}

						if (!userInfo.email) {
							ctx.context.logger.error("Provider did not return email");
							throw redirectOnError(ctx, errorURL, "email_not_found");
						}
						let accountKey: AccountKey;
						try {
							accountKey = await resolveOAuthAccountKey(
								provider,
								tokens,
								userInfoResult.data,
							);
						} catch (error) {
							ctx.context.logger.error(
								"Unable to derive provider account identity",
								{
									providerId: provider.id,
									error,
								},
							);
							throw redirectOnError(ctx, errorURL, "unable_to_get_user_info");
						}
						const providerProfile = toOAuthProfileRecord(userInfoResult.data);

						const proxyCallbackURL = new URL(stateData.callbackURL);
						const finalCallbackURL =
							proxyCallbackURL.searchParams.get("callbackURL") ||
							stateData.callbackURL;

						const payload: PassthroughPayload = {
							userInfo: {
								id: accountKey.accountId,
								email: userInfo.email,
								name: userInfo.name || "",
								image: userInfo.image,
								emailVerified: userInfo.emailVerified,
							},
							profile: providerProfile,
							scopes: tokens.scopes,
							account: {
								...accountKey,
								accessToken: tokens.accessToken,
								refreshToken: tokens.refreshToken,
								idToken: tokens.idToken,
								accessTokenExpiresAt: tokens.accessTokenExpiresAt,
								refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
								scope: tokens.scopes?.join(","),
							},
							state: statePackage.state,
							callbackURL: finalCallbackURL,
							newUserURL: stateData.newUserURL,
							errorURL: stateData.errorURL,
							disableSignUp:
								(provider.disableImplicitSignUp && !stateData.requestSignUp) ||
								provider.options?.disableSignUp,
							timestamp: Date.now(),
						};

						const encryptedPayload = await symmetricEncrypt({
							key: getEncryptionKey(ctx, "oauth-proxy-profile"),
							data: JSON.stringify(payload),
						});

						// Add the profile parameter to proxy callback URL
						proxyCallbackURL.searchParams.set("profile", encryptedPayload);

						// Redirect to the preview's OAuth proxy callback with profile data
						throw ctx.redirect(proxyCallbackURL.toString());
					}),
				},
			],
			after: [
				{
					matcher(context) {
						return (
							!!context.path?.startsWith("/sign-in/social") ||
							context.path === "/link-social"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const skipProxy = checkSkipProxy(ctx, opts);
						if (skipProxy) {
							return;
						}

						// Extract OAuth provider URL from sign-in response
						const signInResponse = ctx.context.returned;
						if (
							!signInResponse ||
							typeof signInResponse !== "object" ||
							!("url" in signInResponse)
						) {
							return;
						}

						const { url: providerURL } = signInResponse;
						if (typeof providerURL !== "string" || providerURL.length === 0) {
							return;
						}

						// Parse provider URL and extract state parameter
						const oauthURL = new URL(providerURL);
						const originalState = oauthURL.searchParams.get("state");
						if (!originalState) {
							return;
						}

						// Recover the plaintext OAuth state for the configured strategy,
						// then re-encrypt it under the proxy-state purpose key so production
						// can read it back; production does not have
						// this environment's `BETTER_AUTH_SECRET`. Any failure (malformed
						// cookie, decrypt, or encrypt) falls back to a non-proxied flow.
						try {
							let plaintextState: string | undefined;
							if (ctx.context.oauthConfig.storeStateStrategy === "cookie") {
								// Cookie mode: the `oauth_state` cookie is encrypted with this
								// environment's secret, so decrypt it locally to recover the state.
								const setCookieHeader =
									ctx.context.responseHeaders?.get("set-cookie");
								if (setCookieHeader) {
									const oauthStateCookie =
										ctx.context.createAuthCookie("oauth_state");
									const encryptedCookieValue = parseSetCookieHeader(
										setCookieHeader,
									).get(oauthStateCookie.name)?.value;
									if (encryptedCookieValue) {
										plaintextState = await symmetricDecrypt({
											key: derivePurposeKey(
												ctx.context.secretConfig,
												"oauth-state-cookie",
											),
											data: encryptedCookieValue,
										});
									}
								}
							} else {
								// Database mode: the verification value is already plaintext JSON.
								const verification =
									await ctx.context.internalAdapter.findVerificationValue(
										getAuthStateVerificationIdentifier(originalState),
									);
								plaintextState = verification?.value;
							}
							if (!plaintextState) {
								ctx.context.logger.warn("No OAuth state found for proxy");
								return;
							}

							// Pack the OAuth state into a compact single-envelope state parameter
							// encrypted under the proxy-package key (single-layer encryption).
							const statePackage: OAuthProxyStatePackage = {
								state: originalState,
								stateCookie: plaintextState,
								isOAuthProxy: true,
							};
							const compactPackage = await packCompactState(
								getEncryptionKey(ctx, "oauth-proxy-package"),
								statePackage,
							);

							// Replace state parameter with compact encrypted package
							oauthURL.searchParams.set("state", compactPackage);

							// Update response with modified URL
							ctx.context.returned = {
								...signInResponse,
								url: oauthURL.toString(),
							};
						} catch (e) {
							ctx.context.logger.error(
								"Failed to prepare OAuth proxy state:",
								e,
							);
							// Continue without proxy
						}
					}),
				},
				{
					matcher(context) {
						return context.path === "/callback/:id";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const headers = ctx.context.responseHeaders;
						const location = headers?.get("location");

						if (
							(!location?.includes("/oauth-proxy?callbackURL") &&
								!location?.includes("/oauth-proxy-callback?callbackURL")) ||
							!location.startsWith("http")
						) {
							return;
						}

						const productionURL =
							opts?.productionURL ||
							(typeof ctx.context.options.baseURL === "string"
								? ctx.context.options.baseURL
								: undefined) ||
							ctx.context.baseURL;
						const productionOrigin = getOrigin(productionURL);

						const locationURL = new URL(location);
						const locationOrigin = locationURL.origin;

						// Same origin: unwrap proxy redirect to original destination
						if (locationOrigin === productionOrigin) {
							const newLocation = locationURL.searchParams.get("callbackURL");
							if (!newLocation) {
								return;
							}
							ctx.setHeader("location", newLocation);
							return;
						}

						// Cross-origin should have been handled by before hook
						ctx.context.logger.warn(
							"OAuth proxy: cross-origin callback reached after hook unexpectedly",
						);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
