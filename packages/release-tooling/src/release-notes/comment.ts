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

function validateReleaseIdentity(version: string, head: string): void {
	parseSchema(releaseVersionSchema, version, "Invalid release version");
	if (!commitShaPattern.test(head)) {
		throw new Error(`Invalid release head SHA: ${head}`);
	}
}

function count(content: string, value: string): number {
	return content.split(value).length - 1;
}

function validateReleaseNotes(notes: string): void {
	if (!notes) throw new Error("Release notes cannot be empty");
	if (reservedMarkerPrefixes.some((marker) => notes.includes(marker))) {
		throw new Error("Release notes cannot contain reserved workflow markers");
	}
}

export function wrapReleaseNotesComment(
	version: string,
	head: string,
	body: string,
	source: ReleaseNoteSource = "ai",
): string {
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
		"Any head update returns this PR to Draft. Rerun `/release-notes` after it changes.",
		"The release bot marks this PR ready. Merging it approves these release notes.",
	].join("\n");
}

export function extractReleaseNotesComment(
	content: string,
	expectedVersion: string,
	expectedHead: string,
): string {
	validateReleaseIdentity(expectedVersion, expectedHead);
	const versionMarker = `<!-- release-version:${expectedVersion} -->`;
	const headMarker = `<!-- release-head:${expectedHead} -->`;
	for (const marker of [
		protocolMarker,
		versionMarker,
		headMarker,
		bodyStartMarker,
		bodyEndMarker,
	]) {
		if (count(content, marker) !== 1) {
			throw new Error(`Expected exactly one ${marker} marker`);
		}
	}

	const start = content.indexOf(bodyStartMarker) + bodyStartMarker.length;
	const end = content.indexOf(bodyEndMarker);
	if (end <= start)
		throw new Error("Release note body markers are out of order");

	const notes = content.slice(start, end).trim();
	validateReleaseNotes(notes);
	return notes;
}
