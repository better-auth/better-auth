import * as z from "zod";
import { isLoopbackHost } from "./host";
import { DANGEROUS_URL_SCHEMES } from "./url";

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
