import * as semver from "semver";
import * as z from "zod";

export const releaseVersionSchema = z
	.string()
	.refine((version) => semver.valid(version) === version, {
		error: "must be a strict semantic version",
	});

export const prereleaseStateSchema = z.object({
	changesets: z.array(z.string()),
});

const releaseTitleSchema = z.string().min(1).max(500);
const changesetDescriptionSchema = z.string().max(20_000).nullable();

export const releaseEntrySchema = z.strictObject({
	id: z.string().min(1),
	rewriteKey: z.string().min(1),
	title: releaseTitleSchema,
	changesetDescription: changesetDescriptionSchema,
	prNumber: z.int().positive().nullable(),
	author: z.string().min(1),
	domain: z.string().min(1),
	packageName: z.string().min(1),
	changeType: z.enum(["breaking", "feat", "fix"]),
	breaking: z.boolean(),
});

const githubUrlSchema = z.url({
	protocol: /^https$/,
	hostname: /^github\.com$/,
});

export const packageReleaseMetadataSchema = z.strictObject({
	newPackage: z.boolean(),
	referenceLabel: z.enum(["CHANGELOG", "README"]),
	referenceUrl: githubUrlSchema,
});

export const releaseManifestSchema = z.strictObject({
	repository: z.string().regex(/^[^/]+\/[^/]+$/),
	version: releaseVersionSchema,
	commitRef: z.string().min(1),
	entries: z.array(releaseEntrySchema).min(1),
	previousTag: z.string().min(1),
	packageMetadata: z.record(z.string().min(1), packageReleaseMetadataSchema),
});

const releaseRewriteSchema = z.strictObject({
	title: z
		.string()
		.trim()
		.min(1)
		.max(300)
		.regex(/^[^\r\n]+$/)
		.describe("A single-line, user-focused release-note title"),
	migration: z
		.string()
		.trim()
		.min(1)
		.max(500)
		.regex(/^[^\r\n]+$/)
		.describe("A single-line action users must take for a breaking change")
		.optional(),
});

export const releaseRewritesSchema = z.strictObject({
	rewrites: z.record(z.string().min(1), releaseRewriteSchema),
});

export const releaseRewriteContextSchema = z
	.record(
		z.string().min(1),
		z.strictObject({
			title: releaseTitleSchema,
			changesetDescription: changesetDescriptionSchema,
			prNumber: z.int().positive().nullable(),
			packageNames: z.array(z.string().min(1)).min(1).max(50),
			changeType: z.enum(["breaking", "feat", "fix"]),
		}),
	)
	.refine((context) => Object.keys(context).length > 0, {
		error: "must contain at least one release entry",
	})
	.refine((context) => Object.keys(context).length <= 250, {
		error: "cannot contain more than 250 release entries",
	});

export type ReleaseEntry = z.infer<typeof releaseEntrySchema>;
export type PackageReleaseMetadata = z.infer<
	typeof packageReleaseMetadataSchema
>;
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type ReleaseRewrites = z.infer<typeof releaseRewritesSchema>["rewrites"];
export type ReleaseRewriteContext = z.infer<typeof releaseRewriteContextSchema>;

export function parseSchema<T>(
	schema: z.ZodType<T>,
	value: unknown,
	message: string,
): T {
	const result = schema.safeParse(value);
	if (result.success) return result.data;

	throw new Error(`${message}\n${z.prettifyError(result.error)}`);
}
