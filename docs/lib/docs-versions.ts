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
 * Extract the current version from a pathname. Matches on a full path segment
 * so `/docs/beta-tutorial/...` is not misread as the `beta` version.
 */
export function getVersionFromPathname(pathname: string): DocsVersion {
	for (const v of docsVersions) {
		if (!v.slug) continue;
		const prefix = `/docs/${v.slug}`;
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
			return v;
		}
	}
	return latestVersion;
}

/**
 * Strip a leading `/docs/<slug>` segment from a pathname, returning the
 * canonical latest-style path (`/docs/...`). Anchored to the leading
 * version segment so unrelated paths are untouched.
 */
export function stripVersionPrefix(
	pathname: string,
	version: DocsVersion,
): string {
	if (!version.slug) return pathname;
	const prefix = `/docs/${version.slug}`;
	if (pathname === prefix) return "/docs";
	if (pathname.startsWith(`${prefix}/`)) {
		return `/docs${pathname.slice(prefix.length)}`;
	}
	return pathname;
}

/**
 * Rewrite an absolute `/docs/...` link so it stays within the active version.
 *
 * - Non-`/docs` links (anchors, external, /blog, etc.) pass through untouched.
 * - On latest (`slug === null`), this is a no-op.
 * - Links that already target a known version (e.g. `/docs/v1.5/...`) are
 *   preserved so authors can link across versions explicitly when needed.
 */
export function scopeDocsHref(
	href: string | undefined,
	version: DocsVersion,
): string | undefined {
	if (!href || !version.slug) return href;
	if (!href.startsWith("/docs/") && href !== "/docs") return href;
	const segment = href.split("/")[2];
	if (segment && docsVersions.some((v) => v.slug === segment)) return href;
	return versionedDocsHref(href, version);
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
