import type { Html } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { formatUntrustedInlineMarkdown } from "../ai/generated-copy.ts";
import type { ReleaseRewriteFallback } from "./schema.ts";
import { parseSchema, releaseVersionSchema } from "./schema.ts";

const protocolMarker = "<!-- better-auth-release-notes:v1 -->";
const bodyStartMarker = "<!-- release-body:start -->";
const bodyEndMarker = "<!-- release-body:end -->";
const reservedMarkerPrefixes = [
	"<!-- better-auth-release-notes:",
	"<!-- release-version:",
	"<!-- release-head:",
	"<!-- release-body:",
];

const commitShaPattern = /^[a-f0-9]{40}$/;

export type ReleaseNoteSource = "ai" | "raw";

interface ReleaseNotesCommentOptions {
	fallbacks?: ReleaseRewriteFallback[];
	merged?: boolean;
	source?: ReleaseNoteSource;
}

function validateReleaseIdentity(version: string, head: string): void {
	parseSchema(releaseVersionSchema, version, "Invalid release version");
	if (!commitShaPattern.test(head)) {
		throw new Error(`Invalid release head SHA: ${head}`);
	}
}

function rootHtmlNodes(content: string): Html[] {
	return fromMarkdown(content).children.filter(
		(node): node is Html => node.type === "html",
	);
}

function findMarker(nodes: Html[], marker: string): Html {
	const matches = nodes.filter((node) => node.value === marker);
	const [match] = matches;
	if (!match || matches.length !== 1) {
		throw new Error(`Expected exactly one ${marker} marker`);
	}
	return match;
}

function validateReleaseNotes(notes: string): void {
	if (!notes) throw new Error("Release notes cannot be empty");
	const containsMarkerLine = rootHtmlNodes(notes).some((node) =>
		reservedMarkerPrefixes.some((marker) => node.value.startsWith(marker)),
	);
	if (containsMarkerLine) {
		throw new Error("Release notes cannot contain reserved workflow markers");
	}
}

function formatFallbackWarning(fallbacks: ReleaseRewriteFallback[]): string[] {
	if (fallbacks.length === 0) return [];
	const count = fallbacks.length;
	return [
		"> [!WARNING]",
		`> **${count} release ${count === 1 ? "note needs" : "notes need"} a closer look.**`,
		">",
		"> I took a second pass, but the copy below still needs human review, so I kept the original wording.",
		">",
		...fallbacks.map((fallback) => {
			const reference = fallback.prNumber ? `#${fallback.prNumber}: ` : "";
			return `> - ${reference}${formatUntrustedInlineMarkdown(fallback.title)}`;
		}),
		">",
		"> Review or edit the original wording before merging.",
		"",
	];
}

export function wrapReleaseNotesComment(
	version: string,
	head: string,
	body: string,
	options: ReleaseNotesCommentOptions = {},
): string {
	const { fallbacks = [], merged = false, source = "ai" } = options;
	validateReleaseIdentity(version, head);
	const notes = body.trim();
	validateReleaseNotes(notes);
	return [
		protocolMarker,
		`<!-- release-version:${version} -->`,
		`<!-- release-head:${head} -->`,
		"",
		...(source === "raw"
			? [
					"> [!NOTE]",
					"> **I'm touching grass.**",
					">",
					"> Rerun `/release-notes` anytime. If I'm back, I'll take it from there. Otherwise, the raw notes below are yours to review and edit.",
					"",
				]
			: []),
		...(source === "ai" ? formatFallbackWarning(fallbacks) : []),
		`# Release preview: v${version}`,
		"",
		"---",
		"",
		bodyStartMarker,
		"",
		notes,
		"",
		bodyEndMarker,
		"",
		"---",
		"",
		...(merged
			? [
					"> [!IMPORTANT]",
					"> **For maintainers:** This PR is already merged. Review and edit the notes above without changing the hidden markers. Re-run the original failed Release workflow when they are ready.",
				]
			: [
					"> [!TIP]",
					"> **For maintainers:** You can edit the notes above, but keep the hidden markers intact. If the head changes, this PR returns to Draft. Rerun `/release-notes` after any update. Merging this PR approves the preview.",
				]),
	].join("\n");
}

export function extractReleaseNotesComment(
	content: string,
	expectedVersion: string,
	expectedHead: string,
): string {
	validateReleaseIdentity(expectedVersion, expectedHead);
	const nodes = rootHtmlNodes(content);
	const versionMarker = `<!-- release-version:${expectedVersion} -->`;
	const headMarker = `<!-- release-head:${expectedHead} -->`;
	for (const marker of [protocolMarker, versionMarker, headMarker]) {
		findMarker(nodes, marker);
	}
	const bodyStart = findMarker(nodes, bodyStartMarker);
	const bodyEnd = findMarker(nodes, bodyEndMarker);
	const start = bodyStart.position?.end.offset;
	const end = bodyEnd.position?.start.offset;
	if (start === undefined || end === undefined || end <= start) {
		throw new Error("Release note body markers are out of order");
	}

	const notes = content.slice(start, end).trim();
	validateReleaseNotes(notes);
	return notes;
}
