import { describe, expect, it } from "vitest";
import {
	extractReleaseNotesComment,
	wrapReleaseNotesComment,
} from "../src/release-notes/comment.ts";

const version = "1.7.2";
const head = "5165d1b6d40a305ff36bfbee271063027c9cfd05";
const notes = "## `better-auth`\n\n- Fixed the original behavior.";

describe("wrapReleaseNotesComment", () => {
	it("wraps editable notes with release identity markers", () => {
		const comment = wrapReleaseNotesComment(version, head, notes);

		expect(comment).toContain("<!-- better-auth-release-notes:v1 -->");
		expect(comment).toContain(`<!-- release-version:${version} -->`);
		expect(comment).toContain(`<!-- release-head:${head} -->`);
		expect(comment).toContain(`# Release preview: v${version}`);
		expect(comment).not.toContain(`## Release preview: v${version}`);
		expect(comment).toContain("<!-- release-body:start -->");
		expect(comment).toContain(notes);
		expect(comment).toContain("<!-- release-body:end -->");
		expect(comment).toContain(
			`# Release preview: v${version}\n\n---\n\n<!-- release-body:start -->`,
		);
		expect(comment).toContain("<!-- release-body:end -->\n\n---\n\n> [!TIP]");
	});

	it("rejects empty release notes", () => {
		expect(() => wrapReleaseNotesComment(version, head, "   ")).toThrow(
			"Release notes cannot be empty",
		);
	});

	it.each([
		"<!-- better-auth-release-notes:v1 -->",
		"<!-- release-version:1.7.2 -->",
		`<!-- release-head:${head} -->`,
		"<!-- release-body:start -->",
		"<!-- release-body:end -->",
	])("rejects reserved markers in generated notes: %s", (marker) => {
		expect(() => wrapReleaseNotesComment(version, head, marker)).toThrow(
			"Release notes cannot contain reserved workflow markers",
		);
	});

	it("allows reserved marker text inside inline code", () => {
		const inline = "- `<!-- release-body:end -->`";
		const comment = wrapReleaseNotesComment(version, head, inline);
		expect(extractReleaseNotesComment(comment, version, head)).toBe(inline);
	});

	it("marks deterministic fallback copy outside the approved body", () => {
		const comment = wrapReleaseNotesComment(version, head, notes, {
			source: "raw",
		});

		expect(comment).toContain("> [!NOTE]");
		expect(comment.indexOf("> [!NOTE]")).toBeLessThan(
			comment.indexOf(`# Release preview: v${version}`),
		);
		expect(extractReleaseNotesComment(comment, version, head)).toBe(notes);
	});

	it("lists partial fallbacks outside the approved body", () => {
		const comment = wrapReleaseNotesComment(version, head, notes, {
			fallbacks: [
				{
					prNumber: 10907,
					title: "fix(client): preserve plugin assignability",
				},
			],
		});

		expect(comment).toContain("**1 release note needs a closer look.**");
		expect(comment).toContain(
			"> - #10907: fix(client): preserve plugin assignability",
		);
		expect(comment.indexOf("> [!WARNING]")).toBeLessThan(
			comment.indexOf(`# Release preview: v${version}`),
		);
		expect(extractReleaseNotesComment(comment, version, head)).toBe(notes);
	});

	it("uses plural copy for multiple partial fallbacks", () => {
		const comment = wrapReleaseNotesComment(version, head, notes, {
			fallbacks: [
				{ prNumber: 42, title: "fix: first change" },
				{ prNumber: 43, title: "fix: second change" },
			],
		});

		expect(comment).toContain("**2 release notes need a closer look.**");
	});

	it("instructs merged release PRs to rerun the failed release", () => {
		const comment = wrapReleaseNotesComment(version, head, notes, {
			merged: true,
		});

		expect(comment).toContain("This PR is already merged");
		expect(comment).toContain("Re-run the original failed Release workflow");
		expect(comment).toContain("> [!IMPORTANT]");
		expect(comment).not.toContain("> [!TIP]");
	});

	it("explains the draft approval lifecycle", () => {
		const comment = wrapReleaseNotesComment(version, head, notes);

		expect(comment).toContain("> [!TIP]");
		expect(comment).toContain("keep the hidden markers intact");
		expect(comment).toContain("this PR returns to Draft");
		expect(comment).toContain("Merging this PR approves the preview");
	});

	it("rejects malformed release identity markers", () => {
		expect(() => wrapReleaseNotesComment("latest", head, notes)).toThrow(
			"Invalid release version",
		);
		expect(() => wrapReleaseNotesComment("1.7.2-01", head, notes)).toThrow(
			"Invalid release version",
		);
		expect(() => wrapReleaseNotesComment(version, "main", notes)).toThrow(
			"Invalid release head SHA",
		);
	});
});

describe("extractReleaseNotesComment", () => {
	it("extracts maintainer edits between the body markers", () => {
		const comment = wrapReleaseNotesComment(version, head, notes).replace(
			"Fixed the original behavior.",
			"Fixed the maintainer-approved behavior.",
		);

		expect(extractReleaseNotesComment(comment, version, head)).toBe(
			"## `better-auth`\n\n- Fixed the maintainer-approved behavior.",
		);
	});

	it("rejects a stale release head", () => {
		const comment = wrapReleaseNotesComment(version, head, notes);

		expect(() =>
			extractReleaseNotesComment(
				comment,
				version,
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			),
		).toThrow("Expected exactly one <!-- release-head:");
	});

	it("rejects a stale release version", () => {
		const comment = wrapReleaseNotesComment(version, head, notes);

		expect(() => extractReleaseNotesComment(comment, "1.7.3", head)).toThrow(
			"Expected exactly one <!-- release-version:1.7.3 --> marker",
		);
	});

	it("rejects duplicate body markers", () => {
		const comment = `${wrapReleaseNotesComment(version, head, notes)}\n<!-- release-body:end -->`;

		expect(() => extractReleaseNotesComment(comment, version, head)).toThrow(
			"Expected exactly one <!-- release-body:end --> marker",
		);
	});

	it("rejects reserved markers added during maintainer editing", () => {
		const comment = wrapReleaseNotesComment(version, head, notes).replace(
			notes,
			`${notes}\n<!-- release-version:1.7.3 -->`,
		);

		expect(() => extractReleaseNotesComment(comment, version, head)).toThrow(
			"Release notes cannot contain reserved workflow markers",
		);
	});
});
