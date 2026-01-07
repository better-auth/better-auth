import * as z from "zod";

/**
 * Reusable URL validation that disallows javascript: scheme
 */
export const SafeUrlSchema = z
	.url()
	.superRefine((val, ctx) => {
		if (!URL.canParse(val)) {
			ctx.addIssue({
				code: "custom",
				message: "URL must be parseable",
				fatal: true,
			});
			return z.NEVER;
		}
	})
	.refine(
		(url) => {
			const u = new URL(url);
			return (
				u.protocol !== "javascript:" &&
				u.protocol !== "data:" &&
				u.protocol !== "vbscript:"
			);
		},
		{ message: "URL cannot use javascript:, data:, or vbscript: scheme" },
	);

export const HttpsOnlyUrl = z
	.url()
	.superRefine((val, ctx) => {
		if (!URL.canParse(val)) {
			ctx.addIssue({
				code: "custom",
				message: "URL must be parseable",
				fatal: true,
			});
			return z.NEVER;
		}
	})
	.refine(
		(url) => {
			const u = new URL(url);
			return u.protocol === "https:";
		},
		{ message: "URL must use https scheme" },
	);
