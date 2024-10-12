import type { CookieOptions } from "better-call";
import { TimeSpan } from "oslo";
import type { BetterAuthOptions } from "../types/options";
import type { GenericEndpointContext } from "../types/context";
import { BetterAuthError } from "../error/better-auth-error";

export function getCookies(options: BetterAuthOptions) {
	const secure =
		options.advanced?.useSecureCookies !== undefined
			? options.advanced?.useSecureCookies
			: options.baseURL?.startsWith("https://") ||
				process.env.NODE_ENV === "production";
	const secureCookiePrefix = secure ? "__Secure-" : "";
	const cookiePrefix = "better-auth";
	const sessionMaxAge =
		options.session?.expiresIn || new TimeSpan(7, "d").seconds();
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

	const sameSite = crossSubdomainEnabled ? "none" : "lax";
	return {
		sessionToken: {
			name: `${secureCookiePrefix}${cookiePrefix}.session_token`,
			options: {
				httpOnly: true,
				sameSite,
				path: "/",
				secure: !!secureCookiePrefix,
				maxAge: sessionMaxAge,
				...(crossSubdomainEnabled ? { domain } : {}),
			} satisfies CookieOptions,
		},
		csrfToken: {
			name: `${secureCookiePrefix}${cookiePrefix}.csrf_token`,
			options: {
				httpOnly: true,
				sameSite,
				path: "/",
				secure: !!secureCookiePrefix,
				maxAge: 60 * 60 * 24 * 7,
				...(crossSubdomainEnabled ? { domain } : {}),
			} satisfies CookieOptions,
		},
		state: {
			name: `${secureCookiePrefix}${cookiePrefix}.state`,
			options: {
				httpOnly: true,
				sameSite,
				path: "/",
				secure: !!secureCookiePrefix,
				maxAge: 60 * 15,
				...(crossSubdomainEnabled ? { domain } : {}),
			} satisfies CookieOptions,
		},
		pkCodeVerifier: {
			name: `${secureCookiePrefix}${cookiePrefix}.pk_code_verifier`,
			options: {
				httpOnly: true,
				sameSite,
				path: "/",
				secure: !!secureCookiePrefix,
				maxAge: 60 * 15,
				...(crossSubdomainEnabled ? { domain } : {}),
			} as CookieOptions,
		},
		dontRememberToken: {
			name: `${secureCookiePrefix}${cookiePrefix}.dont_remember`,
			options: {
				httpOnly: true,
				sameSite,
				path: "/",
				secure: !!secureCookiePrefix,
				//no max age so it expires when the browser closes
				...(crossSubdomainEnabled ? { domain } : {}),
			} as CookieOptions,
		},
		nonce: {
			name: `${secureCookiePrefix}${cookiePrefix}.nonce`,
			options: {
				httpOnly: true,
				sameSite,
				path: "/",
				secure: !!secureCookiePrefix,
				maxAge: 60 * 15,
				...(crossSubdomainEnabled ? { domain } : {}),
			} as CookieOptions,
		},
	};
}

export function createCookieGetter(options: BetterAuthOptions) {
	const secure =
		options.advanced?.useSecureCookies !== undefined
			? options.advanced?.useSecureCookies
			: options.baseURL?.startsWith("https://") ||
				process.env.NODE_ENV === "production";
	const secureCookiePrefix = secure ? "__Secure-" : "";
	const cookiePrefix = "better-auth";

	const domain =
		options.advanced?.crossSubDomainCookies?.domain ||
		(options.baseURL ? new URL(options.baseURL).hostname : undefined);

	function getCookie(cookieName: string, opts?: CookieOptions) {
		const crossSubdomainEnabled = options.advanced?.crossSubDomainCookies
			?.enabled
			? options.advanced.crossSubDomainCookies.additionalCookies?.includes(
					cookieName,
				)
			: undefined;
		return {
			name:
				process.env.NODE_ENV === "production"
					? `${secureCookiePrefix}${cookiePrefix}.${cookieName}`
					: `${cookiePrefix}.${cookieName}`,
			options: {
				secure: !!secureCookiePrefix,
				sameSite: "lax",
				path: "/",
				maxAge: 60 * 15, // 15 minutes in seconds
				...opts,
				...(crossSubdomainEnabled ? { domain } : {}),
			} as CookieOptions,
		};
	}
	return getCookie;
}
export type BetterAuthCookies = ReturnType<typeof getCookies>;

export async function setSessionCookie(
	ctx: GenericEndpointContext,
	sessionToken: string,
	dontRememberMe?: boolean,
	overrides?: Partial<CookieOptions>,
) {
	const options = ctx.context.authCookies.sessionToken.options;
	//@ts-expect-error
	options.maxAge = dontRememberMe
		? undefined
		: ctx.context.sessionConfig.expiresIn;

	await ctx.setSignedCookie(
		ctx.context.authCookies.sessionToken.name,
		sessionToken,
		ctx.context.secret,
		{
			...options,
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
}

export function deleteSessionCookie(ctx: GenericEndpointContext) {
	ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
		maxAge: 0,
	});
	ctx.setCookie(ctx.context.authCookies.dontRememberToken.name, "", {
		maxAge: 0,
	});
}

type CookieAttributes = {
	value: string;
	[key: string]: string | boolean;
};

export function parseSetCookieHeader(
	header: string,
): Map<string, CookieAttributes> {
	const cookieMap = new Map<string, CookieAttributes>();

	// Split the header into individual cookies
	const cookies = header.split(", ");

	cookies.forEach((cookie) => {
		const [nameValue, ...attributes] = cookie.split("; ");
		const [name, value] = nameValue.split("=");

		const cookieObj: CookieAttributes = { value };

		attributes.forEach((attr) => {
			const [attrName, attrValue] = attr.split("=");
			cookieObj[attrName.toLowerCase()] = attrValue || true;
		});

		cookieMap.set(name, cookieObj);
	});

	return cookieMap;
}

export type EligibleCookies = (string & {}) | (keyof BetterAuthCookies & {});
