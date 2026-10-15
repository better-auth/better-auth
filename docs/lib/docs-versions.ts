export interface DocsVersionConfig {
	/**
	 * Display label shown in switcher (e.g. "Latest", "Beta")
	 */
	label: string;
	/**
	 * Release line used in version descriptions (e.g. "1.6").
	 */
	releaseLine: string;
	/**
	 * Stable identifier. Non-latest IDs are also used as URL path segments.
	 */
	id: string;
	/**
	 * Small badge shown next to label (e.g. "beta").
	 */
	badge: string | null;
}

export const docsVersions = [
	{
		label: "v1.7 (Latest)",
		releaseLine: "1.7",
		id: "latest",
		badge: null,
	},
	{
		label: "v1.6",
		releaseLine: "1.6",
		id: "1.6",
		badge: null,
	},
] as const satisfies readonly DocsVersionConfig[];

export type DocsVersion = (typeof docsVersions)[number];
export type DocsVersionId = DocsVersion["id"];

export type ResolvedDocsVersion = DocsVersion & { releaseVersion: string };

export type VersionAvailability = Record<DocsVersionId, readonly string[]>;

const docsRootPathPattern = /^\/docs\/?([?#].*)?$/;

/**
 * The default (latest) version entry.
 */
export const latestVersion = docsVersions[0];

/**
 * Find a version config by its URL slug.
 */
export function getVersionById(id: string): DocsVersion | undefined {
	return docsVersions.find((version) => version.id === id);
}

/**
 * Build a docs href for the given version.
 */
export function versionedDocsHref(path: string, version: DocsVersion): string {
	if (version.id === "latest") return path;
	const docsRootMatch = docsRootPathPattern.exec(path);
	if (docsRootMatch) {
		return `/docs/${version.id}/introduction${docsRootMatch[1] ?? ""}`;
	}
	// /docs/introduction -> /docs/1.6/introduction
	const stripped = path.replace(/^\/docs/, "");
	return `/docs/${version.id}${stripped}`;
}

function matchingPathSegments(left: string, right: string): number {
	const leftSegments = left.split("/").filter(Boolean).slice(1);
	const rightSegments = right.split("/").filter(Boolean).slice(1);
	let matches = 0;
	while (
		matches < leftSegments.length &&
		matches < rightSegments.length &&
		leftSegments[matches] === rightSegments[matches]
	) {
		matches++;
	}
	return matches;
}

/**
 * Resolve the closest available page when moving between documentation versions.
 */
export function getVersionTargetHref(
	pathname: string,
	currentVersion: DocsVersion,
	targetVersion: DocsVersion,
	availability: VersionAvailability,
): string {
	const canonicalPath = stripVersionPrefix(pathname, currentVersion);
	const targetPaths = availability[targetVersion.id];
	if (targetPaths.includes(canonicalPath)) {
		return versionedDocsHref(canonicalPath, targetVersion);
	}

	let closestPath: string | undefined;
	let closestScore = 0;
	for (const path of targetPaths) {
		const score = matchingPathSegments(canonicalPath, path);
		if (score <= closestScore) continue;
		closestPath = path;
		closestScore = score;
	}
	if (closestPath) return versionedDocsHref(closestPath, targetVersion);

	const introduction = targetPaths.find(
		(path) => path === "/docs/introduction",
	);
	return (
		(introduction && versionedDocsHref(introduction, targetVersion)) ??
		(targetPaths[0] && versionedDocsHref(targetPaths[0], targetVersion)) ??
		versionedDocsHref("/docs", targetVersion)
	);
}

/**
 * Extract the current version from a pathname. Matches on a full path segment
 * so `/docs/1.6-migration/...` is not misread as version `1.6`.
 */
export function getVersionFromPathname(pathname: string): DocsVersion {
	for (const version of docsVersions) {
		if (version.id === "latest") continue;
		const prefix = `/docs/${version.id}`;
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
			return version;
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
	if (version.id === "latest") return pathname;
	const prefix = `/docs/${version.id}`;
	if (pathname === prefix || pathname === `${prefix}/`) return "/docs";
	if (pathname.startsWith(`${prefix}/`)) {
		return `/docs${pathname.slice(prefix.length)}`;
	}
	return pathname;
}

/**
 * Rewrite an absolute `/docs/...` link so it stays within the active version.
 *
 * - Non-`/docs` links (anchors, external, /blog, etc.) pass through untouched.
 * - On latest, this is a no-op.
 * - Links that already target one of the currently-registered versions are
 *   preserved so authors can link across versions explicitly when needed.
 */
export function scopeDocsHref(
	href: string | undefined,
	version: DocsVersion,
): string | undefined {
	if (!href || version.id === "latest") return href;
	// Match /docs exactly, /docs/..., /docs?query, or /docs#hash.
	if (!/^\/docs(?:\/|$|[?#])/.test(href)) return href;
	// Strip query/hash before checking the version segment so
	// `/docs/1.6?foo` isn't treated as an unversioned link.
	const pathOnly = href.split(/[?#]/, 1)[0];
	const segment = pathOnly.split("/")[2];
	if (
		segment &&
		docsVersions.some(
			(candidate) => candidate.id !== "latest" && candidate.id === segment,
		)
	) {
		return href;
	}
	return versionedDocsHref(href, version);
}

/**
 * Split a catch-all slug into its version + the remaining content slug.
 *
 * `["1.6", "plugins", "email-otp"]` -> { version: 1.6, relSlug: ["plugins", "email-otp"] }
 * `["introduction"]` -> { version: latest, relSlug: ["introduction"] }
 */
export function resolveVersionFromSlug(slug: string[]): {
	version: DocsVersion;
	relSlug: string[];
} {
	const [head, ...rest] = slug;
	const match = head && head !== "latest" ? getVersionById(head) : undefined;
	if (match) return { version: match, relSlug: rest };

	return { version: latestVersion, relSlug: slug };
}
