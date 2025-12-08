import type {
	BetterAuthCookies,
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import { env, isProduction } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils";
import { base64Url } from "@better-auth/utils/base64";
import { binary } from "@better-auth/utils/binary";
import { createHMAC } from "@better-auth/utils/hmac";
import type { CookieOptions } from "better-call";
import { ms } from "ms";
import {
	signJWT,
	symmetricDecodeJWT,
	symmetricEncodeJWT,
	verifyJWT,
} from "../crypto/jwt";
import { parseUserOutput } from "../db/schema";
import type { Session, User } from "../types";
import { getDate } from "../utils/date";
import { getBaseURL } from "../utils/url";
import { createSessionStore } from "./session-store";

export function createCookieGetter(options: BetterAuthOptions) {
	const secure =
		options.advanced?.useSecureCookies !== undefined
			? options.advanced?.useSecureCookies
			: options.baseURL !== undefined
				? options.baseURL.startsWith("https://")
					? true
					: false
				: isProduction;
	const secureCookiePrefix = secure ? "__Secure-" : "";
	const crossSubdomainEnabled =
		!!options.advanced?.crossSubDomainCookies?.enabled;
	const domain = crossSubdomainEnabled
		? options.advanced?.crossSubDomainCookies?.domain ||
			(options.baseURL ? new URL(options.baseURL).hostname : undefined)
		: undefined;
	if (crossSubdomainEnabled && !domain) {
		throw new BetterAuthError(
			"baseURL is required when crossSubdomainCookies are enabled",
		);
	}
	function createCookie(
		cookieName: string,
		overrideAttributes: Partial<CookieOptions> = {},
	) {
		const prefix = options.advanced?.cookiePrefix || "better-auth";
		const name =
			options.advanced?.cookies?.[cookieName as "session_token"]?.name ||
			`${prefix}.${cookieName}`;

		const attributes =
			options.advanced?.cookies?.[cookieName as "session_token"]?.attributes;

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
			} as CookieOptions,
		};
	}
	return createCookie;
}

export function getCookies(options: BetterAuthOptions) {
	const createCookie = createCookieGetter(options);
	const sessionMaxAge = options.session?.expiresIn || ms("7d") / 1000;
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
			options: sessionToken.attributes,
		},
		/**
		 * This cookie is used to store the session data in the cookie
		 * This is useful for when you want to cache the session in the cookie
		 */
		sessionData: {
			name: sessionData.name,
			options: sessionData.attributes,
		},
		dontRememberToken: {
			name: dontRememberToken.name,
			options: dontRememberToken.attributes,
		},
		accountData: {
			name: accountData.name,
			options: accountData.attributes,
		},
	};
}

export async function setCookieCache(
	ctx: GenericEndpointContext,
	session: {
		session: Session & Record<string, any>;
		user: User;
	},
	dontRememberMe: boolean,
) {
	const shouldStoreSessionDataInCookie =
		ctx.context.options.session?.cookieCache?.enabled;

	if (shouldStoreSessionDataInCookie) {
		const filteredSession = Object.entries(session.session).reduce(
			(acc, [key, value]) => {
				const fieldConfig =
					ctx.context.options.session?.additionalFields?.[key];
				if (!fieldConfig || fieldConfig.returned !== false) {
					acc[key] = value;
				}
				return acc;
			},
			{} as Record<string, any>,
		);

		// Apply field filtering to user data
		const filteredUser = parseUserOutput(ctx.context.options, session.user);

		// Compute version
		const versionConfig = ctx.context.options.session?.cookieCache?.version;
		let version = "1"; // default version
		if (versionConfig) {
			if (typeof versionConfig === "string") {
				version = versionConfig;
			} else if (typeof versionConfig === "function") {
				const result = versionConfig(session.session, session.user);
				version = result instanceof Promise ? await result : result;
			}
		}

		const sessionData = {
			session: filteredSession,
			user: filteredUser,
			updatedAt: Date.now(),
			version,
		};

		const options = {
			...ctx.context.authCookies.sessionData.options,
			maxAge: dontRememberMe
				? undefined
				: ctx.context.authCookies.sessionData.options.maxAge,
		};

		const expiresAtDate = getDate(options.maxAge || 60, "sec").getTime();
		const strategy =
			ctx.context.options.session?.cookieCache?.strategy || "compact";

		let data: string;

		if (strategy === "jwe") {
			// Use JWE strategy (JSON Web Encryption) with A256CBC-HS512 + HKDF
			data = await symmetricEncodeJWT(
				sessionData,
				ctx.context.secret,
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
	}
}

export async function setSessionCookie(
	ctx: GenericEndpointContext,
	session: {
		session: Session & Record<string, any>;
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

	const options = ctx.context.authCookies.sessionToken.options;
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
			ctx.context.authCookies.dontRememberToken.options,
		);
	}
	await setCookieCache(ctx, session, dontRememberMe);
	ctx.context.setNewSession(session);
	/**
	 * If secondary storage is enabled, store the session data in the secondary storage
	 * This is useful if the session got updated and we want to update the session data in the
	 * secondary storage
	 */
	if (ctx.context.options.secondaryStorage) {
		await ctx.context.secondaryStorage?.set(
			session.session.token,
			JSON.stringify({
				user: session.user,
				session: session.session,
			}),
			Math.floor(
				(new Date(session.session.expiresAt).getTime() - Date.now()) / 1000,
			),
		);
	}
}

export function deleteSessionCookie(
	ctx: GenericEndpointContext,
	skipDontRememberMe?: boolean | undefined,
) {
	ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
		...ctx.context.authCookies.sessionToken.options,
		maxAge: 0,
	});

	ctx.setCookie(ctx.context.authCookies.sessionData.name, "", {
		...ctx.context.authCookies.sessionData.options,
		maxAge: 0,
	});

	// Use createSessionStore to clean up all session data chunks
	const sessionStore = createSessionStore(
		ctx.context.authCookies.sessionData.name,
		ctx.context.authCookies.sessionData.options,
		ctx,
	);
	const cleanCookies = sessionStore.clean();
	sessionStore.setCookies(cleanCookies);

	if (!skipDontRememberMe) {
		ctx.setCookie(ctx.context.authCookies.dontRememberToken.name, "", {
			...ctx.context.authCookies.dontRememberToken.options,
			maxAge: 0,
		});
	}
}

export function parseCookies(cookieHeader: string) {
	const cookies = cookieHeader.split("; ");
	const cookieMap = new Map<string, string>();

	cookies.forEach((cookie) => {
		const [name, value] = cookie.split("=");
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
	if (config?.cookiePrefix) {
		if (config.cookieName) {
			config.cookiePrefix = `${config.cookiePrefix}-`;
		} else {
			config.cookiePrefix = `${config.cookiePrefix}.`;
		}
	}
	const headers = "headers" in request ? request.headers : request;
	const req = request instanceof Request ? request : undefined;
	const url = getBaseURL(req?.url, config?.path, req);
	const cookies = headers.get("cookie");
	if (!cookies) {
		return null;
	}
	const { cookieName = "session_token", cookiePrefix = "better-auth." } =
		config || {};
	const name = `${cookiePrefix}${cookieName}`;
	const secureCookieName = `__Secure-${name}`;
	const parsedCookie = parseCookies(cookies);
	const sessionToken =
		parsedCookie.get(name) || parsedCookie.get(secureCookieName);
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
	const headers = request instanceof Headers ? request : request.headers;
	const cookies = headers.get("cookie");
	if (!cookies) {
		return null;
	}
	const { cookieName = "session_data", cookiePrefix = "better-auth" } =
		config || {};
	const name =
		config?.isSecure !== undefined
			? config.isSecure
				? `__Secure-${cookiePrefix}.${cookieName}`
				: `${cookiePrefix}.${cookieName}`
			: isProduction
				? `__Secure-${cookiePrefix}.${cookieName}`
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
						expectedVersion = result instanceof Promise ? await result : result;
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
						expectedVersion = result instanceof Promise ? await result : result;
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
					expectedVersion = result instanceof Promise ? await result : result;
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
export { createSessionStore, getChunkedCookie } from "./session-store";
