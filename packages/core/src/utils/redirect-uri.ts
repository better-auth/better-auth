import * as z from "zod";
import { isLoopbackHost } from "./host";
import { DANGEROUS_URL_SCHEMES } from "./url";

const REVERSE_DOMAIN_PRIVATE_USE_SCHEME =
	/^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

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
 * Operator opt-in for non-loopback `http:` redirect URIs. The callback receives
 * an already-parsed `URL` and is authoritative for any non-loopback HTTP URL,
 * including hosts `classifyHost` would call public (for example
 * `http://myapp.homelab.lan`). Returning `true` allows that origin; any other
 * result keeps the HTTPS-only default.
 */
export type AllowInsecureRedirectUri = (url: URL) => boolean;

function refineStructuralUrl(
	val: string,
	ctx: z.RefinementCtx,
): URL | undefined {
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(val);
	} catch {
		ctx.addIssue({
			code: "custom",
			message: "URL must be parseable",
			fatal: true,
		});
		return undefined;
	}

	if (DANGEROUS_URL_SCHEMES.includes(parsedUrl.protocol)) {
		ctx.addIssue({
			code: "custom",
			message: "URL cannot use javascript:, data:, or vbscript: scheme",
		});
		return undefined;
	}

	if (val.includes("#")) {
		ctx.addIssue({
			code: "custom",
			message: "Redirect URI must not contain a fragment component",
		});
	}

	return parsedUrl;
}

/**
 * Structural URL checks shared by authorize-time and stored-code schemas:
 * parseable URI, no fragment, no `javascript:`/`data:`/`vbscript:`. Does not
 * enforce HTTPS. Use this when the value was already checked against the live
 * redirect-URI policy (for example an authorization-code verification blob).
 */
export function createStructuralUrlSchema() {
	return z.url().superRefine((val, ctx) => {
		refineStructuralUrl(val, ctx);
	});
}

export const StructuralUrlSchema = createStructuralUrlSchema();

/**
 * Zod schema for OAuth redirect URIs and other developer-supplied URLs that the
 * server stores and later hands back to a browser.
 *
 * - Rejects dangerous schemes (`javascript:`, `data:`, `vbscript:`).
 * - Rejects URIs with a fragment component (`#...`) per RFC 6749 §3.1.2.
 * - Requires HTTPS, except for loopback hosts (`127.0.0.0/8`, `[::1]`,
 *   `*.localhost` per RFC 6761), where HTTP is allowed for local development.
 * - Allows custom schemes for mobile apps (e.g. `myapp://callback`).
 * - Optionally allows non-loopback HTTP when `allowInsecureRedirectUri`
 *   returns true for the parsed URL.
 *
 * This is the single source of truth for redirect-URI validation across the
 * OAuth provider plugins. Consume it from `@better-auth/core/utils/redirect-uri`
 * rather than re-implementing the scheme policy per plugin.
 */
export function createSafeUrlSchema(
	allowInsecureRedirectUri?: AllowInsecureRedirectUri,
) {
	return z.url().superRefine((val, ctx) => {
		const parsedUrl = refineStructuralUrl(val, ctx);
		if (!parsedUrl) {
			return;
		}

		if (parsedUrl.protocol === "http:" && !isLoopbackHost(parsedUrl.host)) {
			if (allowInsecureRedirectUri?.(parsedUrl) === true) {
				return;
			}
			ctx.addIssue({
				code: "custom",
				message:
					"Redirect URI must use HTTPS (HTTP allowed only for loopback hosts)",
			});
		}
	});
}

export const SafeUrlSchema = createSafeUrlSchema();
