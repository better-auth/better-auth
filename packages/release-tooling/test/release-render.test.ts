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
						changesetDescription: "Avoid duplicate session requests.",
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
		expect(output).toContain(
			"> **Migration:** Update custom session refresh integrations.",
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

	it("uses deterministic copy when a non-breaking rewrite has a migration", () => {
		const result = renderReleaseRewrites({
			rewrites: [
				{
					id: "pr-10769",
					title: "Fixed duplicate requests",
					migration: "Change an unrelated setting",
				},
			],
		});

		expect(result.status).toBe(0);
		expect(result.output).toContain("fix(client): avoid duplicate requests");
		expect(result.stderr).toContain(
			"Non-breaking AI rewrite pr-10769 cannot have a migration",
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
			"> **Migration:** Update custom session refresh integrations.",
		);
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
