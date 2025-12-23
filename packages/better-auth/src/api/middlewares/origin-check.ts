import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { normalizePathname } from "../../utils/url";

function shouldSkipOriginCheckForPath(
	requestUrl: string,
	basePath: string,
	skipPaths: string[],
): boolean {
	if (skipPaths.length === 0) {
		return false;
	}
	const normalizedPath = normalizePathname(requestUrl, basePath);
	return skipPaths.some(
		(skipPath) =>
			normalizedPath === skipPath || normalizedPath.startsWith(`${skipPath}/`),
	);
}

/**
 * A middleware to validate callbackURL and origin against
 * trustedOrigins.
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
	const headers = ctx.request?.headers;
	const { body, query } = ctx;
	const originHeader = headers?.get("origin") || headers?.get("referer") || "";
	const callbackURL = body?.callbackURL || query?.callbackURL;
	const redirectURL = body?.redirectTo;
	const errorCallbackURL = body?.errorCallbackURL;
	const newUserCallbackURL = body?.newUserCallbackURL;
	const useCookies = headers?.has("cookie");

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

	const skipOriginCheck = ctx.context.skipOriginCheck;
	const basePath = new URL(ctx.context.baseURL).pathname;
	const shouldSkipOrigin =
		skipOriginCheck === true ||
		(Array.isArray(skipOriginCheck) &&
			shouldSkipOriginCheckForPath(ctx.request.url, basePath, skipOriginCheck));

	if (useCookies && !ctx.context.skipCSRFCheck && !shouldSkipOrigin) {
		if (!originHeader || originHeader === "null") {
			throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.MISSING_OR_NULL_ORIGIN);
		}
		validateURL(originHeader, "origin");
	}
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
