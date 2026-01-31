import * as z from "zod";

const DANGEROUS_SCHEMES = ["javascript:", "data:", "vbscript:"];

function isLocalhost(hostname: string): boolean {
	return (
		hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
	);
}

/**
 * Reusable URL validation for OAuth redirect URIs.
 * - Blocks dangerous schemes (javascript:, data:, vbscript:)
 * - For http/https: requires HTTPS (HTTP allowed only for localhost)
 * - Allows custom schemes for mobile apps (e.g., myapp://callback)
 */
export const SafeUrlSchema = z.url().superRefine((val, ctx) => {
	if (!URL.canParse(val)) {
		ctx.addIssue({
			code: "custom",
			message: "URL must be parseable",
			fatal: true,
		});
		return z.NEVER;
	}

	const u = new URL(val);

	if (DANGEROUS_SCHEMES.includes(u.protocol)) {
		ctx.addIssue({
			code: "custom",
			message: "URL cannot use javascript:, data:, or vbscript: scheme",
		});
		return;
	}

	if (u.protocol === "http:" || u.protocol === "https:") {
		if (u.protocol === "http:" && !isLocalhost(u.hostname)) {
			ctx.addIssue({
				code: "custom",
				message:
					"Redirect URI must use HTTPS (HTTP allowed only for localhost)",
			});
		}
	}
});
