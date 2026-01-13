import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { deprecate } from "@better-auth/core/utils/deprecate";
import { matchesOriginPattern } from "../../auth/trusted-origins";

/**
 * Checks if CSRF should be skipped for backward compatibility.
 * Previously, disableOriginCheck also disabled CSRF checks.
 * This maintains that behavior when disableCSRFCheck isn't explicitly set.
 */
function shouldSkipCSRFForBackwardCompat(ctx: GenericEndpointContext): boolean {
	return (
		ctx.context.skipOriginCheck &&
		ctx.context.options.advanced?.disableCSRFCheck === undefined
	);
}

/**
 * Logs deprecation warning for users relying on coupled behavior.
 * Only logs if user explicitly set disableOriginCheck (not test environment default).
 */
const logBackwardCompatWarning = deprecate(
	function logBackwardCompatWarning() {},
	"disableOriginCheck: true currently also disables CSRF checks. " +
		"In a future version, disableOriginCheck will ONLY disable URL validation. " +
		"To keep CSRF disabled, add disableCSRFCheck: true to your config.",
);

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

	if (ctx.context.skipOriginCheck) {
		return;
	}

	const { body, query } = ctx;
	const callbackURL = body?.callbackURL || query?.callbackURL;
	const redirectURL = body?.redirectTo;
	const errorCallbackURL = body?.errorCallbackURL;
	const newUserCallbackURL = body?.newUserCallbackURL;

	const validateURL = (
		url: string | undefined,
		label:
			| "origin"
			| "callbackURL"
			| "redirectURL"
			| "errorCallbackURL"
			| "newUserCallbackURL",
	) => {
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
			if (label === "origin") {
				throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ORIGIN);
			}
			if (label === "callbackURL") {
				throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
			}
			if (label === "redirectURL") {
				throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_REDIRECT_URL);
			}
			if (label === "errorCallbackURL") {
				throw APIError.from(
					"FORBIDDEN",
					BASE_ERROR_CODES.INVALID_ERROR_CALLBACK_URL,
				);
			}
			if (label === "newUserCallbackURL") {
				throw APIError.from(
					"FORBIDDEN",
					BASE_ERROR_CODES.INVALID_NEW_USER_CALLBACK_URL,
				);
			}
			throw APIError.fromStatus("FORBIDDEN", {
				message: `Invalid ${label}`,
			});
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
		if (ctx.context.skipOriginCheck) {
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
				if (label === "origin") {
					throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ORIGIN);
				}
				if (label === "callbackURL") {
					throw APIError.from(
						"FORBIDDEN",
						BASE_ERROR_CODES.INVALID_CALLBACK_URL,
					);
				}
				if (label === "redirectURL") {
					throw APIError.from(
						"FORBIDDEN",
						BASE_ERROR_CODES.INVALID_REDIRECT_URL,
					);
				}
				if (label === "errorCallbackURL") {
					throw APIError.from(
						"FORBIDDEN",
						BASE_ERROR_CODES.INVALID_ERROR_CALLBACK_URL,
					);
				}
				if (label === "newUserCallbackURL") {
					throw APIError.from(
						"FORBIDDEN",
						BASE_ERROR_CODES.INVALID_NEW_USER_CALLBACK_URL,
					);
				}
				throw APIError.fromStatus("FORBIDDEN", {
					message: `Invalid ${label}`,
				});
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

	if (ctx.context.skipCSRFCheck) {
		return;
	}

	if (shouldSkipCSRFForBackwardCompat(ctx)) {
		ctx.context.options.advanced?.disableOriginCheck === true &&
			logBackwardCompatWarning();
		return;
	}

	const shouldValidate = forceValidate || useCookies;

	if (!shouldValidate) {
		return;
	}

	if (!originHeader || originHeader === "null") {
		throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.MISSING_OR_NULL_ORIGIN);
	}

	const trustedOrigins: string[] = Array.isArray(
		ctx.context.options.trustedOrigins,
	)
		? ctx.context.trustedOrigins
		: [
				...ctx.context.trustedOrigins,
				...((await ctx.context.options.trustedOrigins?.(ctx.request))?.filter(
					(v): v is string => Boolean(v),
				) || []),
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

	if (ctx.context.skipCSRFCheck) {
		return;
	}

	if (shouldSkipCSRFForBackwardCompat(ctx)) {
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
			throw APIError.from(
				"FORBIDDEN",
				BASE_ERROR_CODES.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED,
			);
		}

		return await validateOrigin(ctx, true);
	}

	// No cookies, no Fetch Metadata → fallback to old behavior (no validation)
	return;
}
