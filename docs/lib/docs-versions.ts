export interface DocsVersion {
	label: string;
	version: string;
	branch: string;
	/** URL path segment, e.g. "v1.7-beta". null = latest (no prefix). */
	slug: string | null;
	badge: string | null;
}

export const docsVersions: DocsVersion[] = [
	{
		label: "Latest",
		version: "1.6",
		branch: "main",
		slug: null,
		badge: null,
	},
	{
		label: "1.7 beta",
		version: "1.7",
		branch: "next",
		slug: "v1.7-beta",
		badge: "beta",
	},
];

/** The default (latest) version entry. */
export const latestVersion = docsVersions.find((v) => v.slug === null)!;

/** Find a version config by its URL slug. */
export function getVersionBySlug(slug: string): DocsVersion | undefined {
	return docsVersions.find((v) => v.slug === slug);
}

/** Build a docs href for the given version. */
export function versionedDocsHref(path: string, version: DocsVersion): string {
	if (!version.slug) return path;
	// /docs/introduction -> /docs/v/v1.7-beta/introduction
	const stripped = path.replace(/^\/docs/, "");
	return `/docs/v/${version.slug}${stripped}`;
}

/** Extract the current version from a pathname. */
export function getVersionFromPathname(pathname: string): DocsVersion {
	for (const v of docsVersions) {
		if (v.slug && pathname.startsWith(`/docs/v/${v.slug}`)) {
			return v;
		}
	}
	return latestVersion;
}
