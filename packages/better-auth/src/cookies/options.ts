import type {
	BetterAuthCookie,
	BetterAuthOptions,
	CookieSecurity,
} from "@better-auth/core";
import { isProduction } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type { CookieOptions } from "better-call";
import { getCookieKey } from "better-call";
import { sec } from "../utils/time";
import { isDynamicBaseURLConfig } from "../utils/url";

export function createCookieGetter(options: BetterAuthOptions) {
	const baseURLString =
		typeof options.baseURL === "string" ? options.baseURL : undefined;
	const dynamicProtocol =
		typeof options.baseURL === "object" && options.baseURL !== null
			? options.baseURL.protocol
			: undefined;
	const advanced = options.advanced;
	/**
	 * TODO: Remove compatibility aliases in a future minor release:
	 *
	 * - `BetterAuthAdvancedOptions.useSecureCookies`
	 * - `BetterAuthAdvancedOptions.cookiePrefix`
	 * - `getSessionCookie`'s `cookiePrefix`
	 * - `getCookieCache`'s `cookiePrefix` and `isSecure`
	 * - Expo and Electron `cookiePrefix` options
	 * - `stripSecureCookiePrefix`
	 */
	if (
		advanced?.cookieSecurity !== undefined &&
		advanced.useSecureCookies !== undefined
	) {
		throw new BetterAuthError(
			"Use either advanced.cookieSecurity or advanced.useSecureCookies, not both.",
		);
	}
	if (
		advanced?.cookieNamespace !== undefined &&
		advanced.cookiePrefix !== undefined
	) {
		throw new BetterAuthError(
			"Use either advanced.cookieNamespace or advanced.cookiePrefix, not both.",
		);
	}
	const legacyCookieSecurity: CookieSecurity | undefined =
		advanced?.useSecureCookies === undefined
			? undefined
			: advanced.useSecureCookies
				? "secure"
				: "none";
	const inferredCookieSecurity: CookieSecurity =
		dynamicProtocol === "https"
			? "secure"
			: dynamicProtocol === "http"
				? "none"
				: baseURLString
					? baseURLString.startsWith("https://")
						? "secure"
						: "none"
					: isProduction
						? "secure"
						: "none";
	const cookieSecurity =
		advanced?.cookieSecurity ?? legacyCookieSecurity ?? inferredCookieSecurity;
	const cookiePrefix = cookieSecurity === "none" ? undefined : cookieSecurity;
	const namespace =
		advanced?.cookieNamespace || advanced?.cookiePrefix || "better-auth";
	const crossSubdomainEnabled = !!advanced?.crossSubDomainCookies?.enabled;
	if (cookieSecurity === "host" && crossSubdomainEnabled) {
		throw new BetterAuthError(
			'advanced.cookieSecurity "host" cannot be combined with crossSubDomainCookies.',
		);
	}
	const domain = crossSubdomainEnabled
		? advanced?.crossSubDomainCookies?.domain ||
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

	return function createCookie(
		cookieName: string,
		overrideAttributes: Partial<CookieOptions> = {},
	) {
		const name =
			advanced?.cookies?.[cookieName]?.name || `${namespace}.${cookieName}`;
		const attributes = advanced?.cookies?.[cookieName]?.attributes ?? {};
		const cookieAttributes = {
			secure: cookieSecurity !== "none",
			sameSite: "lax",
			path: "/",
			httpOnly: true,
			...(crossSubdomainEnabled ? { domain } : {}),
			...advanced?.defaultCookieAttributes,
			...overrideAttributes,
			...attributes,
		} satisfies CookieOptions;
		if (advanced?.cookieSecurity === "secure") {
			cookieAttributes.secure = true;
		} else if (advanced?.cookieSecurity === "host") {
			cookieAttributes.secure = true;
			cookieAttributes.path = "/";
			cookieAttributes.domain = undefined;
		}

		return {
			name: getCookieKey(name, cookiePrefix) ?? name,
			attributes: cookieAttributes,
		} satisfies BetterAuthCookie;
	};
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
