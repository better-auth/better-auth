/**
 * README fetch helpers: same-repo Markdown redirects + path safety.
 */

const MARKDOWN_EXT = /\.(md|mdx)$/i;
const MAX_REDIRECT_CONTENT_LENGTH = 512;

/**
 * Normalize a repo-relative path. Returns null if it escapes the repo root
 * via `..` or contains unsafe segments.
 */
export function normalizeRepoPath(path: string): string | null {
	const parts = path.replace(/\\/g, "/").split("/");
	const out: string[] = [];
	for (const part of parts) {
		if (!part || part === ".") continue;
		if (part === "..") {
			if (out.length === 0) return null;
			out.pop();
			continue;
		}
		// Reject weird / absolute-ish segments
		if (part.includes("\0") || part.includes(":")) return null;
		out.push(part);
	}
	return out.join("/");
}

/**
 * If the README body is purely a pointer to another Markdown file in the
 * same repository, return that normalized path. Otherwise null.
 *
 * Accepted forms (single non-empty line only):
 * - packages/plugins/README.md
 * - ./docs/readme.md
 * - `packages/foo/README.md`
 * - [docs](./packages/foo/README.md)
 */
export function extractSameRepoMarkdownRedirect(
	content: string,
): string | null {
	const trimmed = content.trim();
	if (!trimmed || trimmed.length > MAX_REDIRECT_CONTENT_LENGTH) return null;

	const lines = trimmed
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length !== 1) return null;

	let candidate = lines[0] ?? "";

	const codeFence = candidate.match(/^`([^`]+)`$/);
	if (codeFence?.[1]) candidate = codeFence[1].trim();

	const quoted = candidate.match(/^['"]([^'"]+)['"]$/);
	if (quoted?.[1]) candidate = quoted[1].trim();

	const mdLink = candidate.match(/^\[[^\]]*]\(([^)]+)\)$/);
	if (mdLink?.[1]) {
		// Drop optional title: path "title"
		candidate = mdLink[1].replace(/\s+".*"$/, "").trim();
	}

	// Absolute / protocol URLs are not same-repo redirects
	if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(candidate)) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return null;

	// Strip hash/query for the fetch target
	candidate = candidate.split(/[?#]/, 1)[0] ?? "";
	candidate = candidate.replace(/^\.\//, "").replace(/^\/+/, "");

	if (!MARKDOWN_EXT.test(candidate)) return null;

	return normalizeRepoPath(candidate);
}

export function readmeBaseDir(filePath: string | null | undefined): string {
	if (!filePath) return "";
	const normalized = normalizeRepoPath(filePath);
	if (!normalized) return "";
	const idx = normalized.lastIndexOf("/");
	return idx === -1 ? "" : normalized.slice(0, idx);
}

/** Allow only safe URL schemes for rendered README links/images. */
export function isSafeReadmeUrl(url: string, kind: "link" | "image"): boolean {
	const value = url.trim();
	if (!value) return false;
	if (value.startsWith("#")) return kind === "link";

	let parsed: URL;
	try {
		// Relative URLs should already be resolved to absolute before this.
		parsed = new URL(value);
	} catch {
		return false;
	}

	const protocol = parsed.protocol.toLowerCase();
	if (protocol === "https:" || protocol === "http:") return true;
	if (protocol === "mailto:" && kind === "link") return true;
	return false;
}
