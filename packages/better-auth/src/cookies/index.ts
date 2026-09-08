import type {
	BetterAuthCookie,
	BetterAuthCookies,
	BetterAuthOptions,
	CookieCachePayload,
	GenericEndpointContext,
} from "@better-auth/core";
import { env, isProduction } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { filterOutputFields } from "@better-auth/core/utils/db";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { binary } from "@better-auth/utils/binary";
import { createHMAC } from "@better-auth/utils/hmac";
import type { CookieOptions } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { shouldBindAccountCookieToSessionUser } from "../context/store-capabilities";
import {
	signJWT as signSecretJWT,
	symmetricDecodeJWT,
	symmetricEncodeJWT,
	verifyJWT as verifySecretJWT,
} from "../crypto/jwt";
import { parseUserOutput } from "../db/schema";
import type { Session, User } from "../types";
import { getDate } from "../utils/date";
import { isPromise } from "../utils/is-promise";
import { sec } from "../utils/time";
import { isDynamicBaseURLConfig } from "../utils/url";
import { parseCompactCookieCache, parseCookieCachePayload } from "./cache";
import {
	parseCookies,
	SECURE_COOKIE_PREFIX,
	splitSetCookieHeader,
} from "./cookie-utils";
import { verifySessionCookieJwtWithJwks } from "./jwt";
import {
	createAccountStore,
	createSessionStore,
	getAccountCookie,
	setAccountCookie,
} from "./session-store";

export function createCookieGetter(options: BetterAuthOptions) {
	const baseURLString =
		typeof options.baseURL === "string" ? options.baseURL : undefined;
	const dynamicProtocol =
		typeof options.baseURL === "object" && options.baseURL !== null
			? options.baseURL.protocol
			: undefined;

	/**
	 * Determines whether cookies should use the `Secure` flag.
	 *
	 * Resolution order:
	 * 1. `advanced.useSecureCookies` — explicit user override, always wins.
	 * 2. Dynamic config `protocol: "https"` / `"http"` — honour the explicit setting.
	 * 3. Static `baseURL` string — check if it starts with `https://`.
	 * 4. Fallback — `isProduction` (i.e. `NODE_ENV === "production"`).
	 *
	 * For dynamic configs with `protocol: "auto"` or unset, the actual
	 * protocol depends on each incoming request and is unknown at init time,
	 * so we fall back to step 4.
	 */
	const secure =
		options.advanced?.useSecureCookies !== undefined
			? options.advanced?.useSecureCookies
			: dynamicProtocol === "https"
				? true
				: dynamicProtocol === "http"
					? false
					: baseURLString
						? baseURLString.startsWith("https://")
						: isProduction;
	const secureCookiePrefix = secure ? SECURE_COOKIE_PREFIX : "";
	const crossSubdomainEnabled =
		!!options.advanced?.crossSubDomainCookies?.enabled;
	const domain = crossSubdomainEnabled
		? options.advanced?.crossSubDomainCookies?.domain ||
			(baseURLString ? new URL(baseURLString).hostname : undefined)
		: undefined;
	if (
		crossSubdomainEnabled &&
		!domain &&
		!isDynamicBaseURLConfig(options.baseURL)
	) {
		throw new BetterAuthError(
			"baseURL is required when crossSubdomainCookies are enabled.",
		);
	}
	function createCookie(
		cookieName: string,
		overrideAttributes: Partial<CookieOptions> = {},
	) {
		const prefix = options.advanced?.cookiePrefix || "better-auth";
		const name =
			options.advanced?.cookies?.[cookieName]?.name ||
			`${prefix}.${cookieName}`;
		const attributes =
			options.advanced?.cookies?.[cookieName]?.attributes ?? {};

		return {
			name: `${secureCookiePrefix}${name}`,
			attributes: {
				secure: !!secureCookiePrefix,
				sameSite: "lax",
				path: "/",
				httpOnly: true,
				...(crossSubdomainEnabled ? { domain } : {}),
				...options.advanced?.defaultCookieAttributes,
				...overrideAttributes,
				...attributes,
			},
		} satisfies BetterAuthCookie;
	}
	return createCookie;
}

export function getCookies(options: BetterAuthOptions) {
	const createCookie = createCookieGetter(options);
	const sessionMaxAge = options.session?.expiresIn || sec("7d");
	const sessionToken = createCookie("session_token", {
		maxAge: sessionMaxAge,
	});
	const sessionData = createCookie("session_data", {
		maxAge: options.session?.cookieCache?.maxAge || 60 * 5,
	});
	const accountData = createCookie("account_data", {
		maxAge: options.session?.cookieCache?.maxAge || 60 * 5,
	});
	const dontRememberToken = createCookie("dont_remember");
	return {
		sessionToken: {
			name: sessionToken.name,
			attributes: sessionToken.attributes,
		},
		/**
		 * This cookie is used to store the session data in the cookie
		 * This is useful for when you want to cache the session in the cookie
		 */
		sessionData: {
			name: sessionData.name,
			attributes: sessionData.attributes,
		},
		dontRememberToken: {
			name: dontRememberToken.name,
			attributes: dontRememberToken.attributes,
		},
		accountData: {
			name: accountData.name,
			attributes: accountData.attributes,
		},
	};
}

export async function setCookieCache(
	ctx: GenericEndpointContext,
	session: {
		session: Session & Record<string, unknown>;
		user: User;
	},
	dontRememberMe: boolean,
) {
	if (!ctx.context.options.session?.cookieCache?.enabled) {
		return;
	}

	const filteredSession = filterOutputFields(
		session.session,
		ctx.context.options.session?.additionalFields,
	);

	const filteredUser = parseUserOutput(ctx.context.options, session.user);

	const versionConfig = ctx.context.options.session?.cookieCache?.version;
	let version = "1";
	if (versionConfig) {
		if (typeof versionConfig === "string") {
			version = versionConfig;
		} else if (typeof versionConfig === "function") {
			const result = versionConfig(session.session, session.user);
			version = isPromise(result) ? await result : result;
		}
	}

	const sessionData = {
		session: filteredSession,
		user: filteredUser,
		updatedAt: Date.now(),
		version,
	} satisfies CookieCachePayload;

	const options = {
		...ctx.context.authCookies.sessionData.attributes,
		maxAge: dontRememberMe
			? undefined
			: ctx.context.authCookies.sessionData.attributes.maxAge,
	};

	const expiresAtDate = getDate(options.maxAge || 60, "sec").getTime();
	const strategy =
		ctx.context.options.session?.cookieCache?.strategy || "compact";

	let data: string;

	if (strategy === "jwe") {
		// Use JWE strategy (JSON Web Encryption) with A256CBC-HS512 + HKDF
		data = await symmetricEncodeJWT(
			sessionData,
			ctx.context.secretConfig,
			"better-auth-session",
			options.maxAge || 60 * 5,
		);
	} else if (strategy === "jwt") {
		const cookieCacheSigner = ctx.context.sessionConfig.cookieCacheSigner;
		data = cookieCacheSigner
			? await cookieCacheSigner.sign(ctx, sessionData, options.maxAge || 60 * 5)
			: await signSecretJWT(
					sessionData,
					ctx.context.secret,
					options.maxAge || 60 * 5,
				);
	} else {
		// Use compact strategy (base64url + HMAC, no JWT spec overhead)
		// Also handles legacy "base64-hmac" for backward compatibility
		data = base64Url.encode(
			JSON.stringify({
				session: sessionData,
				expiresAt: expiresAtDate,
				signature: await createHMAC("SHA-256", "base64urlnopad").sign(
					ctx.context.secret,
					JSON.stringify({
						...sessionData,
						expiresAt: expiresAtDate,
					}),
				),
			}),
			{
				padding: false,
			},
		);
	}

	const sessionStore = createSessionStore(
		ctx.context.authCookies.sessionData.name,
		options,
		ctx,
	);
	sessionStore.setCookies(sessionStore.chunk(data, options));

	// Keep the account cookie in sync, unless this response already set a
	// fresh one that the stale request copy would downgrade or expire.
	if (
		ctx.context.options.account?.storeAccountCookie &&
		!hasPendingSetCookie(ctx, ctx.context.authCookies.accountData.name)
	) {
		const accountData = await getAccountCookie(ctx);
		if (accountData) {
			if (
				!shouldBindAccountCookieToSessionUser(ctx.context.options) ||
				accountData.userId === session.user.id
			) {
				await setAccountCookie(ctx, accountData);
			} else {
				expireCookie(ctx, ctx.context.authCookies.accountData);
				const accountStore = createAccountStore(
					ctx.context.authCookies.accountData.name,
					ctx.context.authCookies.accountData.attributes,
					ctx,
				);
				accountStore.setCookies(accountStore.clean());
			}
		}
	}
}

export async function decodeCookieCache(
	ctx: GenericEndpointContext,
	value: string,
): Promise<{ session: CookieCachePayload; expiresAt: number } | null> {
	const strategy =
		ctx.context.options.session?.cookieCache?.strategy || "compact";

	if (strategy === "jwe") {
		const decoded = await symmetricDecodeJWT<JWTPayload>(
			value,
			ctx.context.secretConfig,
			"better-auth-session",
		);
		const payload = parseCookieCachePayload(decoded);
		if (!payload) {
			return null;
		}
		return {
			session: payload,
			expiresAt: decoded?.exp ? decoded.exp * 1000 : Date.now(),
		};
	}

	if (strategy === "jwt") {
		const cookieCacheSigner = ctx.context.sessionConfig.cookieCacheSigner;
		if (cookieCacheSigner) {
			const verified = await cookieCacheSigner.verify(ctx, value);
			if (!verified) {
				return null;
			}
			return {
				session: verified.payload,
				expiresAt: verified.expiresAt,
			};
		}

		const decoded = await verifySecretJWT<JWTPayload>(
			value,
			ctx.context.secret,
		);
		const payload = parseCookieCachePayload(decoded);
		if (!payload) {
			return null;
		}
		return {
			session: payload,
			expiresAt: decoded?.exp ? decoded.exp * 1000 : Date.now(),
		};
	}

	const parsed = parseCompactCookieCache(
		safeJSONParse(binary.decode(base64Url.decode(value))),
	);
	if (!parsed) {
		return null;
	}

	const valid = await createHMAC("SHA-256", "base64urlnopad").verify(
		ctx.context.secret,
		JSON.stringify({
			...parsed.session,
			expiresAt: parsed.expiresAt,
		}),
		parsed.signature,
	);
	if (!valid) {
		return null;
	}

	const payload = parseCookieCachePayload(parsed.session);
	return payload
		? {
				session: payload,
				expiresAt: parsed.expiresAt,
			}
		: null;
}

export async function setSessionCookie(
	ctx: GenericEndpointContext,
	session: {
		session: Session & Record<string, unknown>;
		user: User;
	},
	dontRememberMe?: boolean | undefined,
	overrides?: Partial<CookieOptions> | undefined,
) {
	const dontRememberMeCookie = await ctx.getSignedCookie(
		ctx.context.authCookies.dontRememberToken.name,
		ctx.context.secret,
	);
	// if dontRememberMe is not set, use the cookie value
	dontRememberMe =
		dontRememberMe !== undefined ? dontRememberMe : !!dontRememberMeCookie;

	const options = ctx.context.authCookies.sessionToken.attributes;
	const maxAge = dontRememberMe
		? undefined
		: ctx.context.sessionConfig.expiresIn;
	await ctx.setSignedCookie(
		ctx.context.authCookies.sessionToken.name,
		session.session.token,
		ctx.context.secret,
		{
			...options,
			maxAge,
			...overrides,
		},
	);

	if (dontRememberMe) {
		await ctx.setSignedCookie(
			ctx.context.authCookies.dontRememberToken.name,
			"true",
			ctx.context.secret,
			ctx.context.authCookies.dontRememberToken.attributes,
		);
	}
	await setCookieCache(ctx, session, dontRememberMe);
	ctx.context.setNewSession(session);
}

type CookieScrubView = GenericEndpointContext & {
	responseHeaders?: Headers;
	context: GenericEndpointContext["context"] & { responseHeaders?: Headers };
};

/**
 * Remove any prior `Set-Cookie` entries on the current response whose cookie
 * name matches `cookieName` or any chunked variant (`${cookieName}.0`, etc.).
 *
 * Prevents a valid cookie value from leaking on the wire when the same cookie
 * is set and then expired within a single request (e.g. `/sign-in/email`
 * writes credential session cookies and the 2FA after-hook expires them).
 * Browsers honor the expiring entry, but anything reading the raw response
 * headers — proxy/LB logs, server-side SDK consumers, observability tools —
 * sees the earlier valid value and could replay it (bypassing the 2FA gate
 * when the cookie cache is enabled).
 *
 * Scrubs both the local middleware scope's `responseHeaders` and the outer
 * endpoint scope's `ctx.context.responseHeaders`, because plugin after-hooks
 * run in a fresh local scope while accumulated response headers live on the
 * outer one. `scoped.context` is required by {@link GenericEndpointContext}
 * but unit-test mocks pass a minimal object via `as any`, so we use optional
 * chaining defensively. The `Set` collapses the case where both scopes
 * reference the same `Headers`.
 */
function removeSetCookieEntries(
	ctx: GenericEndpointContext,
	cookieName: string,
) {
	const scoped = ctx as CookieScrubView;
	const targets = new Set<Headers>();
	if (scoped.responseHeaders) targets.add(scoped.responseHeaders);
	if (scoped.context?.responseHeaders)
		targets.add(scoped.context.responseHeaders);

	const exact = `${cookieName}=`;
	const chunk = `${cookieName}.`;

	for (const headers of targets) {
		// `Headers.getSetCookie()` is standard on Node ≥18.14, Bun, Deno, and
		// Cloudflare Workers, but older Node and some polyfilled Headers shims
		// expose Set-Cookie as a collapsed string. Parse that fallback before
		// rewriting the header so stale session cookies don't survive there.
		const existing =
			typeof headers.getSetCookie === "function"
				? headers.getSetCookie()
				: splitSetCookieHeader(headers.get("set-cookie") || "");
		if (!existing.length) continue;
		const survivors = existing.filter(
			(entry) => !entry.startsWith(exact) && !entry.startsWith(chunk),
		);
		if (survivors.length === existing.length) continue;
		headers.delete("set-cookie");
		for (const entry of survivors) {
			headers.append("set-cookie", entry);
		}
	}
}

/**
 * Whether the response already has a pending `Set-Cookie` for `cookieName`
 * or a chunked variant.
 */
function hasPendingSetCookie(
	ctx: GenericEndpointContext,
	cookieName: string,
): boolean {
	const scoped = ctx as CookieScrubView;
	const targets = new Set<Headers>();
	if (scoped.responseHeaders) targets.add(scoped.responseHeaders);
	if (scoped.context?.responseHeaders)
		targets.add(scoped.context.responseHeaders);

	const exact = `${cookieName}=`;
	const chunk = `${cookieName}.`;

	for (const headers of targets) {
		const existing =
			typeof headers.getSetCookie === "function"
				? headers.getSetCookie()
				: splitSetCookieHeader(headers.get("set-cookie") || "");
		if (
			existing.some(
				(entry) => entry.startsWith(exact) || entry.startsWith(chunk),
			)
		) {
			return true;
		}
	}
	return false;
}

/**
 * Expires a cookie by setting `maxAge: 0` while preserving its attributes
 */
export function expireCookie(
	ctx: GenericEndpointContext,
	cookie: BetterAuthCookie,
) {
	removeSetCookieEntries(ctx, cookie.name);
	ctx.setCookie(cookie.name, "", {
		...cookie.attributes,
		maxAge: 0,
	});
}

export function deleteSessionCookie(
	ctx: GenericEndpointContext,
	skipDontRememberMe?: boolean | undefined,
) {
	expireCookie(ctx, ctx.context.authCookies.sessionToken);
	expireCookie(ctx, ctx.context.authCookies.sessionData);

	if (ctx.context.options.account?.storeAccountCookie) {
		expireCookie(ctx, ctx.context.authCookies.accountData);

		//clean up the account data chunks
		const accountStore = createAccountStore(
			ctx.context.authCookies.accountData.name,
			ctx.context.authCookies.accountData.attributes,
			ctx,
		);
		const cleanCookies = accountStore.clean();
		accountStore.setCookies(cleanCookies);
	}

	if (ctx.context.oauthConfig.storeStateStrategy === "cookie") {
		expireCookie(ctx, ctx.context.createAuthCookie("oauth_state"));
	}

	// Use createSessionStore to clean up all session data chunks
	const sessionStore = createSessionStore(
		ctx.context.authCookies.sessionData.name,
		ctx.context.authCookies.sessionData.attributes,
		ctx,
	);
	const cleanCookies = sessionStore.clean();
	sessionStore.setCookies(cleanCookies);

	if (!skipDontRememberMe) {
		expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
	}
}

function isEmbeddedSessionExpired(
	session: { expiresAt?: unknown } | undefined,
) {
	if (!session?.expiresAt) {
		return false;
	}

	const expiresAt = new Date(
		session.expiresAt as string | number | Date,
	).getTime();
	return Number.isFinite(expiresAt) && expiresAt < Date.now();
}

export type EligibleCookies = (string & {}) | (keyof BetterAuthCookies & {});

export const getSessionCookie = (
	request: Request | Headers,
	config?:
		| {
				cookiePrefix?: string;
				cookieName?: string;
				path?: string;
		  }
		| undefined,
) => {
	const headers =
		request instanceof Headers || !("headers" in request)
			? request
			: request.headers;
	const cookies = headers.get("cookie");
	if (!cookies) {
		return null;
	}
	const { cookieName = "session_token", cookiePrefix = "better-auth" } =
		config || {};
	const parsedCookie = parseCookies(cookies);
	// Prefer __Secure- (HTTPS-only) over a non-secure leftover.
	const getCookie = (name: string) =>
		parsedCookie.get(`${SECURE_COOKIE_PREFIX}${name}`) ??
		parsedCookie.get(name);

	const sessionToken =
		getCookie(`${cookiePrefix}.${cookieName}`) ||
		getCookie(`${cookiePrefix}-${cookieName}`);
	if (sessionToken) {
		return sessionToken;
	}

	return null;
};

export const getCookieCache = async <
	S extends CookieCachePayload = CookieCachePayload,
>(
	request: Request | Headers,
	config?:
		| {
				cookiePrefix?: string;
				cookieName?: string;
				isSecure?: boolean;
				secret?: string;
				strategy?: "compact" | "jwt" | "jwe"; // base64-hmac for backward compatibility
				jwt?:
					| {
							jwks?: JSONWebKeySet;
							issuer?: string;
							audience?: string;
					  }
					| undefined;
				version?:
					| string
					| ((
							session: CookieCachePayload["session"],
							user: CookieCachePayload["user"],
					  ) => string)
					| ((
							session: CookieCachePayload["session"],
							user: CookieCachePayload["user"],
					  ) => Promise<string>);
		  }
		| undefined,
) => {
	const headers =
		request instanceof Headers || !("headers" in request)
			? request
			: request.headers;
	const cookies = headers.get("cookie");
	if (!cookies) {
		return null;
	}
	const { cookieName = "session_data", cookiePrefix = "better-auth" } =
		config || {};
	const name =
		config?.isSecure !== undefined
			? config.isSecure
				? `${SECURE_COOKIE_PREFIX}${cookiePrefix}.${cookieName}`
				: `${cookiePrefix}.${cookieName}`
			: isProduction
				? `${SECURE_COOKIE_PREFIX}${cookiePrefix}.${cookieName}`
				: `${cookiePrefix}.${cookieName}`;
	const parsedCookie = parseCookies(cookies);

	// Check for chunked cookies
	let sessionData = parsedCookie.get(name);
	if (!sessionData) {
		// Try to reconstruct from chunks
		const chunks: Array<{ index: number; value: string }> = [];
		for (const [cookieName, value] of parsedCookie.entries()) {
			if (cookieName.startsWith(name + ".")) {
				const parts = cookieName.split(".");
				const indexStr = parts[parts.length - 1];
				const index = parseInt(indexStr || "0", 10);
				if (!isNaN(index)) {
					chunks.push({ index, value });
				}
			}
		}

		if (chunks.length > 0) {
			// Sort by index and join
			chunks.sort((a, b) => a.index - b.index);
			sessionData = chunks.map((c) => c.value).join("");
		}
	}

	if (sessionData) {
		const strategy = config?.strategy || "compact";

		if (strategy === "jwe") {
			const secret = config?.secret || env.BETTER_AUTH_SECRET;
			if (!secret) {
				throw new BetterAuthError(
					"getCookieCache requires a secret to be provided. Either pass it as an option or set the BETTER_AUTH_SECRET environment variable",
				);
			}
			// Use JWE strategy (encrypted)
			const decoded = await symmetricDecodeJWT<unknown>(
				sessionData,
				secret,
				"better-auth-session",
			);
			const payload = parseCookieCachePayload(decoded);

			if (payload) {
				// Validate version if provided
				if (config?.version) {
					const cookieVersion = payload.version || "1";
					let expectedVersion = "1";
					if (typeof config.version === "string") {
						expectedVersion = config.version;
					} else if (typeof config.version === "function") {
						const result = config.version(payload.session, payload.user);
						expectedVersion = isPromise(result) ? await result : result;
					}
					if (cookieVersion !== expectedVersion) {
						return null;
					}
				}
				if (isEmbeddedSessionExpired(payload.session)) {
					return null;
				}
				return payload as S;
			}
			return null;
		} else if (strategy === "jwt") {
			const jwks = config?.jwt?.jwks;
			let payload: CookieCachePayload | null;
			if (jwks) {
				payload = await verifySessionCookieJwtWithJwks(sessionData, jwks, {
					issuer: config?.jwt?.issuer,
					audience: config?.jwt?.audience,
				});
			} else {
				const secret = config?.secret || env.BETTER_AUTH_SECRET;
				if (!secret) {
					throw new BetterAuthError(
						"getCookieCache requires a secret to be provided. Either pass it as an option or set the BETTER_AUTH_SECRET environment variable",
					);
				}
				const decoded = await verifySecretJWT<unknown>(sessionData, secret);
				payload = parseCookieCachePayload(decoded);
			}

			if (payload) {
				// Validate version if provided
				if (config?.version) {
					const cookieVersion = payload.version || "1";
					let expectedVersion = "1";
					if (typeof config.version === "string") {
						expectedVersion = config.version;
					} else if (typeof config.version === "function") {
						const result = config.version(payload.session, payload.user);
						expectedVersion = isPromise(result) ? await result : result;
					}
					if (cookieVersion !== expectedVersion) {
						return null;
					}
				}
				if (isEmbeddedSessionExpired(payload.session)) {
					return null;
				}
				return payload as S;
			}
			return null;
		} else {
			const secret = config?.secret || env.BETTER_AUTH_SECRET;
			if (!secret) {
				throw new BetterAuthError(
					"getCookieCache requires a secret to be provided. Either pass it as an option or set the BETTER_AUTH_SECRET environment variable",
				);
			}
			// Use compact strategy (or legacy base64-hmac)
			const sessionDataPayload = parseCompactCookieCache(
				safeJSONParse(binary.decode(base64Url.decode(sessionData))),
			);
			if (!sessionDataPayload) {
				return null;
			}
			const isValid = await createHMAC("SHA-256", "base64urlnopad").verify(
				secret,
				JSON.stringify({
					...sessionDataPayload.session,
					expiresAt: sessionDataPayload.expiresAt,
				}),
				sessionDataPayload.signature,
			);
			if (!isValid) {
				return null;
			}
			const payload = parseCookieCachePayload(sessionDataPayload.session);
			if (!payload) {
				return null;
			}
			// Validate version if provided
			if (config?.version) {
				const cookieVersion = payload.version || "1";
				let expectedVersion = "1";
				if (typeof config.version === "string") {
					expectedVersion = config.version;
				} else if (typeof config.version === "function") {
					const result = config.version(payload.session, payload.user);
					expectedVersion = isPromise(result) ? await result : result;
				}
				if (cookieVersion !== expectedVersion) {
					return null;
				}
			}

			// The compact strategy carries no `exp` claim, so the outer cache window
			// and the embedded session lifetime must be checked explicitly (the
			// jwt/jwe strategies get the outer window from their `exp` claim).
			if (
				typeof sessionDataPayload.expiresAt === "number" &&
				sessionDataPayload.expiresAt < Date.now()
			) {
				return null;
			}
			if (isEmbeddedSessionExpired(payload.session)) {
				return null;
			}

			return payload as S;
		}
	}
	return null;
};

export * from "./cookie-utils";
export {
	createSessionStore,
	getAccountCookie,
	getChunkedCookie,
	setAccountCookie,
} from "./session-store";
