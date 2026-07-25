import { isSafeReadmeUrl, normalizeRepoPath, readmeBaseDir } from "./readme";

/** Rewrite relative README asset/link URLs to absolute GitHub URLs. */
export function resolveReadmeUrl(
	href: string | undefined,
	repo: string,
	branch: string,
	kind: "link" | "image" = "link",
	/** Directory of the rendered README within the repo (no trailing slash). */
	baseDir = "",
): string | undefined {
	if (!href) return href;

	const trimmed = href.trim();
	if (!trimmed) return undefined;

	// Protocol-relative
	if (trimmed.startsWith("//")) {
		const absolute = `https:${trimmed}`;
		return isSafeReadmeUrl(absolute, kind) ? absolute : undefined;
	}

	if (
		trimmed.startsWith("http://") ||
		trimmed.startsWith("https://") ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("mailto:")
	) {
		return isSafeReadmeUrl(trimmed, kind) ? trimmed : undefined;
	}

	// Block dangerous / opaque schemes (javascript:, data:, vbscript:, …)
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
		return undefined;
	}

	let relative = trimmed.replace(/^\.\//, "");
	if (relative.startsWith("/")) {
		relative = relative.replace(/^\/+/, "");
	} else if (baseDir) {
		relative = `${baseDir}/${relative}`;
	}

	const cleaned = normalizeRepoPath(relative);
	if (!cleaned) return undefined;

	const absolute =
		kind === "image"
			? `https://raw.githubusercontent.com/${repo}/${branch}/${cleaned}`
			: `https://github.com/${repo}/blob/${branch}/${cleaned}`;

	return isSafeReadmeUrl(absolute, kind) ? absolute : undefined;
}

export { readmeBaseDir };
