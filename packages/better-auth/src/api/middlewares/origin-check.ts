import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
import { matchesOriginPattern } from "../../auth/trusted-origins";

/**
 * A middleware to validate callbackURL and origin against trustedOrigins.
 * Also handles CSRF protection using Fetch Metadata for first-login scenarios.
 */
export const originCheckMiddleware = createAuthMiddleware(async (ctx) => {
	// Skip origin check for GET, OPTIONS, HEAD requests - we don't mutate state here.
	if (
		ctx.request?.method === "GET" ||
		ctx.request?.method === "OPTIONS" ||
		ctx.request?.method === "HEAD" ||
		!ctx.request
	) {
		return;
	}
	await validateOrigin(ctx);

	const { body, query } = ctx;
	const callbackURL = body?.callbackURL || query?.callbackURL;
	const redirectURL = body?.redirectTo;
	const errorCallbackURL = body?.errorCallbackURL;
	const newUserCallbackURL = body?.newUserCallbackURL;

	const validateURL = (url: string | undefined, label: string) => {
		if (!url) {
			return;
		}
		const isTrustedOrigin = ctx.context.isTrustedOrigin(url, {
			allowRelativePaths: label !== "origin",
		});

		if (!isTrustedOrigin) {
			ctx.context.logger.error(`Invalid ${label}: ${url}`);
			ctx.context.logger.info(
				`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`,
				`Current list of trustedOrigins: ${ctx.context.trustedOrigins}`,
			);
			throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
		}
	};

	callbackURL && validateURL(callbackURL, "callbackURL");
	redirectURL && validateURL(redirectURL, "redirectURL");
	errorCallbackURL && validateURL(errorCallbackURL, "errorCallbackURL");
	newUserCallbackURL && validateURL(newUserCallbackURL, "newUserCallbackURL");
});

export const originCheck = (
	getValue: (ctx: GenericEndpointContext) => string | string[],
) =>
	createAuthMiddleware(async (ctx) => {
		if (!ctx.request) {
			return;
		}
		const callbackURL = getValue(ctx);
		const validateURL = (url: string | undefined, label: string) => {
			if (!url) {
				return;
			}
			const isTrustedOrigin = ctx.context.isTrustedOrigin(url, {
				allowRelativePaths: label !== "origin",
			});

			if (!isTrustedOrigin) {
				ctx.context.logger.error(`Invalid ${label}: ${url}`);
				ctx.context.logger.info(
					`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`,
					`Current list of trustedOrigins: ${ctx.context.trustedOrigins}`,
				);
				throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
			}
		};
		const callbacks = Array.isArray(callbackURL) ? callbackURL : [callbackURL];
		for (const url of callbacks) {
			validateURL(url, "callbackURL");
		}
	});

/**
 * Validates origin header against trusted origins.
 * @param ctx - The endpoint context
 * @param forceValidate - If true, always validate origin regardless of cookies/skip flags
 */
async function validateOrigin(
	ctx: GenericEndpointContext,
	forceValidate = false,
): Promise<void> {
	const headers = ctx.request?.headers;
	if (!headers || !ctx.request) {
		return;
	}
	const originHeader = headers.get("origin") || headers.get("referer") || "";
	const useCookies = headers.has("cookie");

	const shouldValidate =
		forceValidate ||
		(useCookies && !ctx.context.skipCSRFCheck && !ctx.context.skipOriginCheck);

	if (!shouldValidate) {
		return;
	}

	if (!originHeader || originHeader === "null") {
		throw new APIError("FORBIDDEN", { message: "Missing or null Origin" });
	}

	const trustedOrigins: string[] = Array.isArray(
		ctx.context.options.trustedOrigins,
	)
		? ctx.context.trustedOrigins
		: [
				...ctx.context.trustedOrigins,
				...((await ctx.context.options.trustedOrigins?.(ctx.request)) || []),
			];

	const isTrustedOrigin = trustedOrigins.some((origin) =>
		matchesOriginPattern(originHeader, origin),
	);
	if (!isTrustedOrigin) {
		ctx.context.logger.error(`Invalid origin: ${originHeader}`);
		ctx.context.logger.info(
			`If it's a valid URL, please add ${originHeader} to trustedOrigins in your auth config\n`,
			`Current list of trustedOrigins: ${trustedOrigins}`,
		);
		throw new APIError("FORBIDDEN", { message: "Invalid origin" });
	}
}

/**
 * Middleware for CSRF protection using Fetch Metadata headers.
 * This prevents cross-site navigation login attacks while supporting progressive enhancement.
 */
export const formCsrfMiddleware = createAuthMiddleware(async (ctx) => {
	const request = ctx.request;
	if (!request) {
		return;
	}

	await validateFormCsrf(ctx);
});

/**
 * Validates CSRF protection for first-login scenarios using Fetch Metadata headers.
 * This prevents cross-site form submission attacks while supporting progressive enhancement.
 */
async function validateFormCsrf(ctx: GenericEndpointContext): Promise<void> {
	const req = ctx.request;
	if (!req) {
		return;
	}

	const headers = req.headers;
	const hasAnyCookies = headers.has("cookie");

	if (hasAnyCookies) {
		return await validateOrigin(ctx);
	}

	const site = headers.get("Sec-Fetch-Site");
	const mode = headers.get("Sec-Fetch-Mode");
	const dest = headers.get("Sec-Fetch-Dest");

	const hasMetadata = Boolean(
		(site && site.trim()) || (mode && mode.trim()) || (dest && dest.trim()),
	);

	if (hasMetadata) {
		// Block cross-site navigation requests (classic CSRF attack pattern)
		if (site === "cross-site" && mode === "navigate") {
			ctx.context.logger.error(
				"Blocked cross-site navigation login attempt (CSRF protection)",
				{
					secFetchSite: site,
					secFetchMode: mode,
					secFetchDest: dest,
				},
			);
			throw new APIError("FORBIDDEN", {
				message: BASE_ERROR_CODES.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED,
			});
		}

		return await validateOrigin(ctx, true);
	}

	// No cookies, no Fetch Metadata → fallback to old behavior (no validation)
	return;
}
