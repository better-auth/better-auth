import type { CookieOptions } from "better-call";
import { TimeSpan } from "oslo";
import { base64url } from "oslo/encoding";
import { hmac } from "../crypto/hash";
import { BetterAuthError } from "../error";
import type { Session, User } from "../types";
import type { GenericEndpointContext } from "../types/context";
import type { BetterAuthOptions } from "../types/options";
import { getDate } from "../utils/date";
import { isProduction } from "../utils/env";

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
		options.session?.expiresIn || new TimeSpan(7, "d").seconds();
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

export async function setSessionCookie(
	ctx: GenericEndpointContext,
	session: {
		session: Session;
		user: User;
	},
	dontRememberMe?: boolean,
	overrides?: Partial<CookieOptions>,
) {
	const options = ctx.context.authCookies.sessionToken.options;
	const maxAge = dontRememberMe
		? undefined
		: ctx.context.sessionConfig.expiresIn;
	await ctx.setSignedCookie(
		ctx.context.authCookies.sessionToken.name,
		session.session.id,
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
	const shouldStoreSessionDataInCookie =
		ctx.context.options.session?.cookieCache?.enabled;
	shouldStoreSessionDataInCookie &&
		ctx.setCookie(
			ctx.context.authCookies.sessionData.name,
			JSON.stringify(
				base64url.encode(
					new TextEncoder().encode(
						JSON.stringify({
							session: session,
							expiresAt: getDate(
								ctx.context.authCookies.sessionData.options.maxAge || 60,
								"sec",
							).getTime(),
							signature: await hmac.sign({
								value: JSON.stringify(session),
								secret: ctx.context.secret,
							}),
						}),
					),
				),
			),
			ctx.context.authCookies.sessionData.options,
		);
	/**
	 * If secondary storage is enabled, store the session data in the secondary storage
	 * This is useful if the session got updated and we want to update the session data in the
	 * secondary storage
	 */
	if (ctx.context.options.secondaryStorage) {
		await ctx.context.secondaryStorage?.set(
			session.session.id,
			JSON.stringify({
				user: session.user,
				session: session.session,
			}),
			session.session.expiresAt.getTime() - Date.now(), // set the expiry time to the same as the session
		);
	}
}

export function deleteSessionCookie(ctx: GenericEndpointContext) {
	ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
		...ctx.context.authCookies.sessionToken.options,
		maxAge: 0,
	});
	ctx.setCookie(ctx.context.authCookies.sessionData.name, "", {
		...ctx.context.authCookies.sessionData.options,
		maxAge: 0,
	});
	ctx.setCookie(ctx.context.authCookies.dontRememberToken.name, "", {
		...ctx.context.authCookies.dontRememberToken.options,
		maxAge: 0,
	});
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

export * from "./cookie-utils";
