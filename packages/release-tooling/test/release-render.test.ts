import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { JSONValue } from "ai";
import { describe, expect, it } from "vitest";
import { formatReleaseBody } from "../src/release-notes/render.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const releaseNotesScript = resolve(
	import.meta.dirname,
	"../src/commands/release-notes.ts",
);

interface CommandResult {
	output: string | null;
	status: number | null;
	stderr: string;
}

function renderReleaseRewrites(
	rewrites: JSONValue,
	breaking = false,
	changesetDescription = "Avoid duplicate session requests.",
): CommandResult {
	const directory = mkdtempSync(
		resolve(tmpdir(), "better-auth-release-notes-"),
	);
	const manifestPath = resolve(directory, "manifest.json");
	const rewritesPath = resolve(directory, "rewrites.json");
	const outputPath = resolve(directory, "final.md");

	try {
		writeFileSync(
			manifestPath,
			JSON.stringify({
				repository: "better-auth/better-auth",
				version: "1.6.28",
				commitRef: "86faaee",
				previousTag: "v1.6.27",
				packageMetadata: {
					"better-auth": {
						newPackage: false,
						referenceLabel: "CHANGELOG",
						referenceUrl:
							"https://github.com/better-auth/better-auth/blob/86faaee/packages/better-auth/CHANGELOG.md",
					},
				},
				entries: [
					{
						id: "pr-10769:better-auth",
						rewriteKey: "pr-10769",
						title: "fix(client): avoid duplicate requests",
						changesetDescription,
						prNumber: 10769,
						author: "bytaesu",
						domain: "core",
						packageName: "better-auth",
						changeType: breaking ? "breaking" : "fix",
						breaking,
					},
				],
			}),
		);
		writeFileSync(rewritesPath, JSON.stringify(rewrites));

		const result = spawnSync(
			process.execPath,
			[
				releaseNotesScript,
				"render",
				"--manifest",
				manifestPath,
				"--rewrites",
				rewritesPath,
				"--output",
				outputPath,
			],
			{ cwd: repositoryRoot, encoding: "utf-8" },
		);

		return {
			output: existsSync(outputPath) ? readFileSync(outputPath, "utf-8") : null,
			status: result.status,
			stderr: result.stderr,
		};
	} finally {
		rmSync(directory, { recursive: true });
	}
}

describe("AI release-note rewrites", () => {
	it("neutralizes unsupported Markdown in deterministic copy", () => {
		const output = formatReleaseBody({
			repository: "better-auth/better-auth",
			version: "2.0.0",
			commitRef: "0123456789abcdef0123456789abcdef01234567",
			previousTag: "v1.9.0",
			packageMetadata: {
				"better-auth": {
					newPackage: false,
					referenceLabel: "CHANGELOG",
					referenceUrl:
						"https://github.com/better-auth/better-auth/blob/0123456789abcdef0123456789abcdef01234567/packages/better-auth/CHANGELOG.md",
				},
			},
			entries: [
				{
					id: "pr-42:better-auth",
					rewriteKey: "pr-42",
					title:
						"Read [the migration guide](https://example.com) and notify @maintainers",
					changesetDescription:
						"Breaking change\n\nRead https://example.com before upgrading.",
					prNumber: 42,
					author: "octocat",
					domain: "core",
					packageName: "better-auth",
					changeType: "breaking",
					breaking: true,
				},
				{
					id: "pr-43:better-auth",
					rewriteKey: "pr-43",
					title: "Changed session refresh behavior\n\nInjected paragraph",
					changesetDescription: "Update custom session refresh integrations.",
					prNumber: 43,
					author: "octocat",
					domain: "core",
					packageName: "better-auth",
					changeType: "breaking",
					breaking: true,
				},
			],
		});

		expect(output).toContain(
			"- `Read [the migration guide](https://example.com) and notify @maintainers`",
		);
		expect(output).not.toContain("Read https://example.com before upgrading");
		// A breaking change stays in the action list even when its changeset
		// cannot be shown, and otherwise its changeset explains it.
		expect(output).toContain(
			"> - `Read [the migration guide](https://example.com) and notify @maintainers` ([#42](https://github.com/better-auth/better-auth/pull/42))\n",
		);
		expect(output).toContain(
			"> - Changed session refresh behavior Injected paragraph ([#43](https://github.com/better-auth/better-auth/pull/43))\n>\n>   Update custom session refresh integrations.",
		);
		expect(output).toContain(
			"- Changed session refresh behavior Injected paragraph",
		);
	});

	it("renders validated copy without exposing release structure", () => {
		const result = renderReleaseRewrites({
			rewrites: [
				{
					id: "pr-10769",
					title:
						"Prevented duplicate session requests during React Suspense retries",
					migration: null,
				},
			],
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.output).toContain(
			"Prevented duplicate session requests during React Suspense retries",
		);
		expect(result.output).toContain("## `better-auth`");
		expect(result.output).toContain("@bytaesu");
	});

	it("uses deterministic copy for a missing rewrite", () => {
		const result = renderReleaseRewrites({ rewrites: [] });

		expect(result.status, result.stderr).toBe(0);
		expect(result.output).toContain("fix(client): avoid duplicate requests");
	});

	it("rejects an unknown rewrite", () => {
		const result = renderReleaseRewrites({
			rewrites: [
				{
					id: "pr-10769",
					title: "Fixed duplicate requests",
					migration: null,
				},
				{
					id: "pr-99999",
					title: "Added an unrelated change",
					migration: null,
				},
			],
		});

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"AI rewrite IDs did not match the manifest",
		);
	});

	it("rejects duplicate rewrite IDs", () => {
		const result = renderReleaseRewrites({
			rewrites: [
				{
					id: "pr-10769",
					title: "Fixed duplicate requests",
					migration: null,
				},
				{
					id: "pr-10769",
					title: "Replaced the approved rewrite",
					migration: null,
				},
			],
		});

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"AI rewrite IDs did not match the manifest",
		);
	});

	it("rejects unsupported fields at the schema boundary", () => {
		const result = renderReleaseRewrites({
			rewrites: [
				{
					id: "pr-10769",
					title: "Fixed duplicate requests",
					migration: null,
					body: "Attempt to replace deterministic release structure",
				},
			],
		});

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"AI rewrite output must contain a valid rewrites array",
		);
	});

	it("renders migration copy for a non-breaking change that asks users to act", () => {
		const result = renderReleaseRewrites(
			{
				rewrites: [
					{
						id: "pr-10769",
						title: "Fixed duplicate requests",
						migration: "Set `clientId` on the provider.",
					},
				],
			},
			false,
			"Set `clientId` on the provider.",
		);

		expect(result.status, result.stderr).toBe(0);
		expect(result.output).toMatch(
			/^> \[!IMPORTANT\]\n> \*\*Action required\*\*\n>\n> - Set `clientId` on the provider\. \(\[#10769\]/,
		);
		expect(result.output).toContain(
			"- Fixed duplicate requests ([#10769](https://github.com/better-auth/better-auth/pull/10769))\n",
		);
	});

	it("uses deterministic copy when a migration quotes code missing from the changeset", () => {
		const result = renderReleaseRewrites({
			rewrites: [
				{
					id: "pr-10769",
					title: "Fixed duplicate requests",
					migration: "Run `npx unknown-package` before upgrading.",
				},
			],
		});

		expect(result.status).toBe(0);
		expect(result.output).toContain("fix(client): avoid duplicate requests");
		expect(result.output).not.toContain("unknown-package");
		expect(result.stderr).toContain(
			"AI rewrite pr-10769 migration quotes code that is not in the changeset",
		);
	});

	it("uses deterministic copy when a migration hides code in doubled backticks", () => {
		const result = renderReleaseRewrites({
			rewrites: [
				{
					id: "pr-10769",
					title: "Fixed duplicate requests",
					migration: "Run ``npx unknown-package`` before upgrading.",
				},
			],
		});

		expect(result.status).toBe(0);
		expect(result.output).not.toContain("unknown-package");
		expect(result.stderr).toContain(
			"AI rewrite pr-10769 migration quotes code that is not in the changeset",
		);
	});

	it("uses deterministic copy when an escaped backtick shifts a code span", () => {
		const result = renderReleaseRewrites(
			{
				rewrites: [
					{
						id: "pr-10769",
						title: "Fixed duplicate requests",
						migration: "Run \\`clientId`npx unknown-package`clientId` now.",
					},
				],
			},
			false,
			"Set `clientId` on the provider.",
		);

		expect(result.status).toBe(0);
		expect(result.output).not.toContain("unknown-package");
		expect(result.stderr).toContain(
			"AI rewrite pr-10769 migration quotes code that is not in the changeset",
		);
	});

	it("uses deterministic copy when a breaking rewrite has no migration", () => {
		const result = renderReleaseRewrites(
			{
				rewrites: [
					{
						id: "pr-10769",
						title: "Changed session refresh behavior",
						migration: null,
					},
				],
			},
			true,
		);

		expect(result.status).toBe(0);
		expect(result.output).toContain("fix(client): avoid duplicate requests");
		expect(result.stderr).toContain(
			"Breaking AI rewrite pr-10769 must have a single-line migration",
		);
	});

	it("renders migration copy for a breaking change", () => {
		const result = renderReleaseRewrites(
			{
				rewrites: [
					{
						id: "pr-10769",
						title: "Changed session refresh behavior",
						migration: "Update custom session refresh integrations.",
					},
				],
			},
			true,
		);

		expect(result.status, result.stderr).toBe(0);
		expect(result.output).toContain(
			"> - Update custom session refresh integrations. ([#10769]",
		);
	});

	it("lists an action shared by several packages once", () => {
		const entry = {
			rewriteKey: "pr-42",
			title: "fix: require explicit migration",
			changesetDescription: "Run `auth migrate` after upgrading.",
			prNumber: 42,
			author: "octocat",
			domain: "core",
			changeType: "fix",
			breaking: false,
		} as const;
		const metadata = {
			newPackage: false,
			referenceLabel: "CHANGELOG",
			referenceUrl:
				"https://github.com/better-auth/better-auth/blob/0123456789abcdef0123456789abcdef01234567/CHANGELOG.md",
		} as const;
		const output = formatReleaseBody(
			{
				repository: "better-auth/better-auth",
				version: "1.9.1",
				commitRef: "0123456789abcdef0123456789abcdef01234567",
				previousTag: "v1.9.0",
				packageMetadata: {
					"better-auth": metadata,
					"@better-auth/sso": metadata,
				},
				entries: [
					{ ...entry, id: "pr-42:better-auth", packageName: "better-auth" },
					{
						...entry,
						id: "pr-42:@better-auth/sso",
						packageName: "@better-auth/sso",
					},
				],
			},
			{
				"pr-42": {
					title: "Fixed missing migration",
					migration: "Run `auth migrate` after upgrading.",
				},
			},
		);

		expect(output.match(/Run `auth migrate`/g)).toHaveLength(1);
		expect(output.match(/- Fixed missing migration/g)).toHaveLength(2);
	});

	it("allows safe identifiers inside inline code", () => {
		const title =
			"Fixed `@better-auth/sso` configurations using `Auth<Options>`";
		const result = renderReleaseRewrites({
			rewrites: [{ id: "pr-10769", title, migration: null }],
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.output).toContain(title);
	});

	it.each([
		"Read https://example.com before upgrading",
		"See [the migration guide](https://example.com)",
		"Notify @maintainers before upgrading",
		"<img src=x onerror=alert(1)>",
	])("uses deterministic copy for unsupported AI Markdown: %s", (title) => {
		const result = renderReleaseRewrites({
			rewrites: [{ id: "pr-10769", title, migration: null }],
		});

		expect(result.status).toBe(0);
		expect(result.output).toContain("fix(client): avoid duplicate requests");
		expect(result.stderr).toContain(
			"AI rewrite pr-10769 title contains unsupported Markdown",
		);
	});
});
