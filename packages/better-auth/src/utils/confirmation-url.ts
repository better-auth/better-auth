import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { isSafeUrlScheme } from "@better-auth/core/utils/url";
import { trimTrailingSlashes } from "./url";

/**
 * Validates the `callbackURL` used as the emailed link in `"explicit"`
 * confirmation mode, where the link is the app's own page (with a token
 * appended) instead of one of Better Auth's own endpoints.
 *
 * The URL must be absolute, because it is emailed and a relative one cannot
 * be resolved by a mail client, and it must not point back at one of the
 * state-changing `GET` callbacks that explicit mode exists to keep out of
 * reach of link prefetchers and scanners. Whether it is a trusted origin is
 * checked separately by the global origin check, before the handler runs.
 *
 * Throws before any side effect, so callers should run it before creating
 * the verification token.
 *
 * @param baseURL - The resolved auth base URL (`ctx.context.baseURL`).
 * @param callbackURL - The `callbackURL` from the request.
 * @param blockedPaths - Auth endpoint paths (relative to the base path) that
 * the link must not target, e.g. `["/delete-user/callback"]`.
 * @returns The validated absolute URL.
 */
export function assertExplicitCallbackURL(
	baseURL: string,
	callbackURL: string | undefined,
	blockedPaths: string[],
): string {
	if (!callbackURL) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CALLBACK_URL_REQUIRED);
	}
	let target: URL;
	try {
		target = new URL(callbackURL);
	} catch {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
	}
	if (!isSafeUrlScheme(callbackURL)) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
	}
	const base = new URL(baseURL);
	if (target.origin === base.origin) {
		const targetPath = trimTrailingSlashes(target.pathname).toLowerCase();
		const basePath = trimTrailingSlashes(base.pathname);
		const blocked = blockedPaths.some(
			(path) => targetPath === `${basePath}${path}`.toLowerCase(),
		);
		if (blocked) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
		}
	}
	return callbackURL;
}
