import type { CookieOptions } from "better-call";
import { BetterAuthError } from "../error";
import type { Session, User } from "../types";
import type { GenericEndpointContext } from "../types/context";
import type { BetterAuthOptions } from "../types/options";
import { getDate } from "../utils/date";
import { isProduction } from "../utils/env";
import { base64Url } from "@better-auth/utils/base64";
import { createTime } from "../utils/time";
import { createHMAC } from "@better-auth/utils/hmac";
import { safeJSONParse } from "../utils/json";
import { getBaseURL } from "../utils/url";

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
	const sessionMaxAge =
		options.session?.expiresIn || createTime(7, "d").toSeconds();
	const sessionToken = createCookie("session_token", {
		maxAge: sessionMaxAge,
	});
	const sessionData = createCookie("session_data", {
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
	};
}

export type BetterAuthCookies = ReturnType<typeof getCookies>;

export async function setCookieCache(
	ctx: GenericEndpointContext,
	session: {
		session: Session & Record<string, any>;
		user: User;
	},
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
		const sessionData = { session: filteredSession, user: session.user };
		const data = base64Url.encode(
			JSON.stringify({
				session: sessionData,
				expiresAt: getDate(
					ctx.context.authCookies.sessionData.options.maxAge || 60,
					"sec",
				).getTime(),
				signature: await createHMAC("SHA-256", "base64urlnopad").sign(
					ctx.context.secret,
					JSON.stringify({
						...sessionData,
						expiresAt: getDate(
							ctx.context.authCookies.sessionData.options.maxAge || 60,
							"sec",
						).getTime(),
					}),
				),
			}),
			{
				padding: false,
			},
		);
		if (data.length > 4093) {
			throw new BetterAuthError(
				"Session data is too large to store in the cookie. Please disable session cookie caching or reduce the size of the session data",
			);
		}
		ctx.setCookie(
			ctx.context.authCookies.sessionData.name,
			data,
			ctx.context.authCookies.sessionData.options,
		);
	}
}

export async function setSessionCookie(
	ctx: GenericEndpointContext,
	session: {
		session: Session & Record<string, any>;
		user: User;
	},
	dontRememberMe?: boolean,
	overrides?: Partial<CookieOptions>,
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
	await setCookieCache(ctx, session);
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
	skipDontRememberMe?: boolean,
) {
	ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
		...ctx.context.authCookies.sessionToken.options,
		maxAge: 0,
	});
	ctx.setCookie(ctx.context.authCookies.sessionData.name, "", {
		...ctx.context.authCookies.sessionData.options,
		maxAge: 0,
	});
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
		cookieMap.set(name, value);
	});
	return cookieMap;
}

export type EligibleCookies = (string & {}) | (keyof BetterAuthCookies & {});

export const getSessionCookie = (
	request: Request | Headers,
	config?: {
		cookiePrefix?: string;
		cookieName?: string;
		path?: string;
	},
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

export const getCookieCache = <
	Session extends {
		session: Session & Record<string, any>;
		user: User & Record<string, any>;
	},
>(
	request: Request | Headers,
	config?: {
		cookiePrefix?: string;
		cookieName?: string;
	},
) => {
	const headers = request instanceof Headers ? request : request.headers;
	const cookies = headers.get("cookie");
	if (!cookies) {
		return null;
	}
	const { cookieName = "session_data", cookiePrefix = "better-auth" } =
		config || {};
	const name = isProduction
		? `__Secure-${cookiePrefix}.${cookieName}`
		: `${cookiePrefix}.${cookieName}`;
	const parsedCookie = parseCookies(cookies);
	const sessionData = parsedCookie.get(name);
	if (sessionData) {
		return safeJSONParse<Session>(sessionData);
	}
	return null;
};

export * from "./cookie-utils";
