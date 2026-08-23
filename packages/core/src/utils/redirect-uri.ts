import * as z from "zod";
import { isLoopbackHost } from "./host";
import { DANGEROUS_URL_SCHEMES } from "./url";

const REVERSE_DOMAIN_PRIVATE_USE_SCHEME =
	/^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

const NON_PRIVATE_USE_SCHEMES = new Set([
	"http:",
	"https:",
	"file:",
	"ftp:",
	"mailto:",
	"javascript:",
	"data:",
	"vbscript:",
]);

/**
 * Returns whether a parsed redirect URI uses an authority-free, reverse-domain
 * private-use scheme as recommended by RFC 8252 §7.1.
 */
export function isReverseDomainPrivateUseRedirectUri(uri: URL): boolean {
	const scheme = uri.protocol.slice(0, -1);
	const schemeSpecificPart = uri.href.slice(uri.protocol.length);
	return (
		uri.protocol !== "http:" &&
		uri.protocol !== "https:" &&
		uri.host.length === 0 &&
		schemeSpecificPart.startsWith("/") &&
		!schemeSpecificPart.startsWith("//") &&
		REVERSE_DOMAIN_PRIVATE_USE_SCHEME.test(scheme)
	);
}

/**
 * Returns whether a parsed redirect URI uses a non-reserved custom scheme with
 * an authority component (for example `cursor://anysphere.cursor-mcp/oauth/callback`).
 *
 * RFC 8252 §7.1 *recommends* the authority-free reverse-domain form; it does
 * not forbid host-bearing private-use URIs. Native MCP clients such as Cursor
 * register the latter. Dangerous and network schemes stay rejected.
 *
 * @see https://github.com/better-auth/better-auth/issues/10946
 */
export function isHostBearingPrivateUseRedirectUri(uri: URL): boolean {
	if (NON_PRIVATE_USE_SCHEMES.has(uri.protocol)) {
		return false;
	}
	if (uri.host.length === 0) {
		return false;
	}
	return uri.pathname.startsWith("/");
}

/** RFC 8252 recommended form or a host-bearing non-reserved custom scheme. */
export function isNativePrivateUseRedirectUri(uri: URL): boolean {
	return (
		isReverseDomainPrivateUseRedirectUri(uri) ||
		isHostBearingPrivateUseRedirectUri(uri)
	);
}

/**
 * Zod schema for OAuth redirect URIs and other developer-supplied URLs that the
 * server stores and later hands back to a browser.
 *
 * - Rejects dangerous schemes (`javascript:`, `data:`, `vbscript:`).
 * - Rejects URIs with a fragment component (`#...`) per RFC 6749 §3.1.2.
 * - Requires HTTPS, except for loopback hosts (`127.0.0.0/8`, `[::1]`,
 *   `*.localhost` per RFC 6761), where HTTP is allowed for local development.
 * - Allows custom schemes for mobile apps (e.g. `myapp://callback`).
 *
 * This is the single source of truth for redirect-URI validation across the
 * OAuth provider plugins. Consume it from `@better-auth/core/utils/redirect-uri`
 * rather than re-implementing the scheme policy per plugin.
 */
export const SafeUrlSchema = z.url().superRefine((val, ctx) => {
	let u: URL;
	try {
		u = new URL(val);
	} catch {
		ctx.addIssue({
			code: "custom",
			message: "URL must be parseable",
			fatal: true,
		});
		return z.NEVER;
	}

	if (DANGEROUS_URL_SCHEMES.includes(u.protocol)) {
		ctx.addIssue({
			code: "custom",
			message: "URL cannot use javascript:, data:, or vbscript: scheme",
		});
		return;
	}

	if (val.includes("#")) {
		ctx.addIssue({
			code: "custom",
			message: "Redirect URI must not contain a fragment component",
		});
	}

	if (u.protocol === "http:" && !isLoopbackHost(u.host)) {
		ctx.addIssue({
			code: "custom",
			message:
				"Redirect URI must use HTTPS (HTTP allowed only for loopback hosts)",
		});
	}
});
