import type { Html } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
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

export function wrapReleaseNotesComment(
	version: string,
	head: string,
	body: string,
	options: ReleaseNotesCommentOptions = {},
): string {
	const { merged = false, source = "ai" } = options;
	validateReleaseIdentity(version, head);
	const notes = body.trim();
	validateReleaseNotes(notes);
	return [
		protocolMarker,
		`<!-- release-version:${version} -->`,
		`<!-- release-head:${head} -->`,
		"",
		`## Release preview: v${version}`,
		"",
		bodyStartMarker,
		"",
		notes,
		"",
		bodyEndMarker,
		"",
		...(source === "raw"
			? [
					"> **AI rewrite unavailable:** This preview uses deterministic release-note copy. Review and edit it before merging.",
					"",
				]
			: []),
		"Maintainers may edit the release notes above. Keep the hidden markers intact.",
		...(merged
			? [
					"This PR is already merged. Re-run the original failed Release workflow after reviewing these notes.",
				]
			: [
					"Any head update returns this PR to Draft. Rerun `/release-notes` after it changes.",
					"The release bot marks this PR ready. Merging it approves these release notes.",
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
