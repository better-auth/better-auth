import type {
	BetterAuthCookie,
	BetterAuthCookies,
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import { writers } from "@better-auth/core/context/internals";
import { env, isProduction } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { filterOutputFields } from "@better-auth/core/utils/db";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { binary } from "@better-auth/utils/binary";
import { createHMAC } from "@better-auth/utils/hmac";
import type { CookieOptions } from "better-call";
import { serializeCookie } from "better-call";
import {
	signJWT,
	symmetricDecodeJWT,
	symmetricEncodeJWT,
	verifyJWT,
} from "../crypto/jwt";
import { parseUserOutput } from "../db/schema";
import type { Session, User } from "../types";
import { getDate } from "../utils/date";
import { isPromise } from "../utils/is-promise";
import { sec } from "../utils/time";
import { isDynamicBaseURLConfig } from "../utils/url";
import { SECURE_COOKIE_PREFIX } from "./cookie-utils";
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
	const sessionOnlyToken = createCookie("session_only");
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
		sessionOnlyToken: {
			name: sessionOnlyToken.name,
			attributes: sessionOnlyToken.attributes,
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
		session: Session & Record<string, any>;
		user: User;
	},
	rememberMe: boolean,
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
	};

	const options = {
		...ctx.context.authCookies.sessionData.attributes,
		maxAge: rememberMe
			? ctx.context.authCookies.sessionData.attributes.maxAge
			: undefined,
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
		// Use JWT strategy with HMAC-SHA256 signature (HS256), no encryption
		data = await signJWT(
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

	// Check if we need to chunk the cookie (only if it exceeds 4093 bytes)
	if (data.length > 4093) {
		const sessionStore = createSessionStore(
			ctx.context.authCookies.sessionData.name,
			options,
			ctx,
		);
		const cookies = sessionStore.chunk(data, options);
		sessionStore.setCookies(cookies);
	} else {
		const sessionStore = createSessionStore(
			ctx.context.authCookies.sessionData.name,
			options,
			ctx,
		);
		if (sessionStore.hasChunks()) {
			const cleanCookies = sessionStore.clean();
			sessionStore.setCookies(cleanCookies);
		}
		ctx.setCookie(ctx.context.authCookies.sessionData.name, data, options);
	}

	// Refresh account cookie to keep it in sync
	if (ctx.context.options.account?.storeAccountCookie) {
		const accountData = await getAccountCookie(ctx);
		if (accountData) {
			await setAccountCookie(ctx, accountData);
		}
	}
}

/**
 * Writes the session cookie (and any supporting cookies) and pins the session
 * onto `ctx.context.issuedSession` so downstream after-hooks and plugins
 * observe the same session the browser just received.
 *
 * **Invariant:** any code path that publishes the session cookie for a given
 * request must also mirror the session into request state via
 * `writers(ctx.context).setIssuedSession(session)` (done here). Do not write
 * `better-auth.session_token` via `ctx.setSignedCookie` directly without
 * mirroring the in-memory state, otherwise after-hooks will see a stale (or
 * missing) session and make wrong decisions about what to do next (e.g.
 * whether to stamp lastLoginMethod, whether to sync multi-session, etc.).
 */
export async function setSessionCookie(
	ctx: GenericEndpointContext,
	session: {
		session: Session & Record<string, any>;
		user: User;
	},
	rememberMe?: boolean | undefined,
	overrides?: Partial<CookieOptions> | undefined,
) {
	const sessionOnlyCookie = await ctx.getSignedCookie(
		ctx.context.authCookies.sessionOnlyToken.name,
		ctx.context.secret,
	);
	// if rememberMe is not set, inherit from the session-only cookie: its
	// presence means the browser previously opted into session-only.
	rememberMe = rememberMe !== undefined ? rememberMe : !sessionOnlyCookie;

	const options = ctx.context.authCookies.sessionToken.attributes;
	const maxAge = rememberMe ? ctx.context.sessionConfig.expiresIn : undefined;
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

	if (!rememberMe) {
		await ctx.setSignedCookie(
			ctx.context.authCookies.sessionOnlyToken.name,
			"true",
			ctx.context.secret,
			ctx.context.authCookies.sessionOnlyToken.attributes,
		);
	}
	await setCookieCache(ctx, session, rememberMe);
	writers(ctx.context).setIssuedSession(session);
}

/**
 * Expires a cookie by setting `maxAge: 0` while preserving its attributes
 */
export function expireCookie(
	ctx: GenericEndpointContext,
	cookie: BetterAuthCookie,
) {
	ctx.setCookie(cookie.name, "", {
		...cookie.attributes,
		maxAge: 0,
	});
}

export function deleteSessionCookie(
	ctx: GenericEndpointContext,
	skipSessionOnly?: boolean | undefined,
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

	if (!skipSessionOnly) {
		expireCookie(ctx, ctx.context.authCookies.sessionOnlyToken);
	}
}

/**
 * Append expired `Set-Cookie` headers for every auth cookie produced by
 * `setSessionCookie`, plus any plugin-issued cookies tied to the same
 * sign-in (collected via `FinalizedSignIn.cookiesToExpireOnRollback`).
 * Used during sign-in rollback (after-hook errors) to retract cookies that
 * were already emitted before the DB session was deleted, avoiding a window
 * where the browser holds a token (or a marker pointing at one) that no
 * longer exists server-side.
 */
export function expireSessionCookiesInHeaders(
	headers: Headers,
	authCookies: BetterAuthCookies,
	extras: readonly BetterAuthCookie[] = [],
) {
	const expire = (cookie: BetterAuthCookie) => {
		headers.append(
			"set-cookie",
			serializeCookie(cookie.name, "", {
				...cookie.attributes,
				maxAge: 0,
			}),
		);
	};
	expire(authCookies.sessionToken);
	expire(authCookies.sessionData);
	expire(authCookies.sessionOnlyToken);
	for (const extra of extras) {
		expire(extra);
	}
}

export function parseCookies(cookieHeader: string) {
	const cookies = cookieHeader.split("; ");
	const cookieMap = new Map<string, string>();

	cookies.forEach((cookie) => {
		const [name, value] = cookie.split(/=(.*)/s);
		cookieMap.set(name!, value!);
	});
	return cookieMap;
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
	const getCookie = (name: string) =>
		parsedCookie.get(name) ||
		parsedCookie.get(`${SECURE_COOKIE_PREFIX}${name}`);

	const sessionToken =
		getCookie(`${cookiePrefix}.${cookieName}`) ||
		getCookie(`${cookiePrefix}-${cookieName}`);
	if (sessionToken) {
		return sessionToken;
	}

	return null;
};

export const getCookieCache = async <
	S extends {
		session: Session & Record<string, any>;
		user: User & Record<string, any>;
		updatedAt: number;
		version?: string;
	},
>(
	request: Request | Headers,
	config?:
		| {
				cookiePrefix?: string;
				cookieName?: string;
				isSecure?: boolean;
				secret?: string;
				strategy?: "compact" | "jwt" | "jwe"; // base64-hmac for backward compatibility
				version?:
					| string
					| ((
							session: Session & Record<string, any>,
							user: User & Record<string, any>,
					  ) => string)
					| ((
							session: Session & Record<string, any>,
							user: User & Record<string, any>,
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
		const secret = config?.secret || env.BETTER_AUTH_SECRET;
		if (!secret) {
			throw new BetterAuthError(
				"getCookieCache requires a secret to be provided. Either pass it as an option or set the BETTER_AUTH_SECRET environment variable",
			);
		}

		const strategy = config?.strategy || "compact";

		if (strategy === "jwe") {
			// Use JWE strategy (encrypted)
			const payload = await symmetricDecodeJWT<S>(
				sessionData,
				secret,
				"better-auth-session",
			);

			if (payload && payload.session && payload.user) {
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
				return payload;
			}
			return null;
		} else if (strategy === "jwt") {
			// Use JWT strategy with HMAC signature (HS256), no encryption
			const payload = await verifyJWT<S>(sessionData, secret);

			if (payload && payload.session && payload.user) {
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
				return payload;
			}
			return null;
		} else {
			// Use compact strategy (or legacy base64-hmac)
			const sessionDataPayload = safeJSONParse<{
				session: S;
				expiresAt: number;
				signature: string;
			}>(binary.decode(base64Url.decode(sessionData)));
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

			// Validate version if provided
			if (config?.version && sessionDataPayload.session) {
				const cookieVersion = sessionDataPayload.session.version || "1";
				let expectedVersion = "1";
				if (typeof config.version === "string") {
					expectedVersion = config.version;
				} else if (typeof config.version === "function") {
					const result = config.version(
						sessionDataPayload.session.session,
						sessionDataPayload.session.user,
					);
					expectedVersion = isPromise(result) ? await result : result;
				}
				if (cookieVersion !== expectedVersion) {
					return null;
				}
			}

			return sessionDataPayload.session;
		}
	}
	return null;
};

export * from "./cookie-utils";
export {
	createSessionStore,
	getAccountCookie,
	getChunkedCookie,
} from "./session-store";
