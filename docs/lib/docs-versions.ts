export interface DocsVersion {
	/**
	 * Display label shown in switcher (e.g. "Latest", "Beta")
	 */
	label: string;
	/**
	 * Numeric version for badge rendering (e.g. "1.6").
	 */
	version: string;
	/**
	 * Branch holding this version's source code (for edit-on-github links).
	 */
	branch: string;
	/**
	 * URL path segment (e.g. "beta"). null = latest (no prefix).
	 */
	slug: string | null;
	/**
	 * Small badge shown next to label (e.g. "beta").
	 */
	badge: string | null;
}

export const docsVersions: DocsVersion[] = [
	{
		label: "v1.7 (Beta)",
		version: "1.7",
		branch: "next",
		slug: "beta",
		badge: null,
	},
	{
		label: "v1.6 (Latest)",
		version: "1.6",
		branch: "main",
		slug: null,
		badge: null,
	},
];

/**
 * The default (latest) version entry.
 */
export const latestVersion = docsVersions.find((v) => v.slug === null)!;

/**
 * Find a version config by its URL slug.
 */
export function getVersionBySlug(slug: string): DocsVersion | undefined {
	return docsVersions.find((v) => v.slug === slug);
}

/**
 * Build a docs href for the given version.
 */
export function versionedDocsHref(path: string, version: DocsVersion): string {
	if (!version.slug) return path;
	// /docs/introduction -> /docs/beta/introduction
	const stripped = path.replace(/^\/docs/, "");
	return `/docs/${version.slug}${stripped}`;
}

/**
 * Extract the current version from a pathname.
 */
export function getVersionFromPathname(pathname: string): DocsVersion {
	for (const v of docsVersions) {
		if (v.slug && pathname.startsWith(`/docs/${v.slug}`)) {
			return v;
		}
	}
	return latestVersion;
}

/**
 * Split a catch-all slug into its version + the remaining content slug.
 *
 * `["beta", "plugins", "email-otp"]` -> { version: beta, relSlug: ["plugins", "email-otp"] }
 * `["introduction"]` -> { version: latest, relSlug: ["introduction"] }
 */
export function resolveVersionFromSlug(slug: string[]): {
	version: DocsVersion;
	relSlug: string[];
} {
	const [head, ...rest] = slug;
	const match = head ? getVersionBySlug(head) : undefined;
	if (match) return { version: match, relSlug: rest };

	return { version: latestVersion, relSlug: slug };
}
