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
import { describe, expect, it } from "vitest";

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
	rewrites: unknown,
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
				"--experimental-strip-types",
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
	it("renders validated copy without exposing release structure", () => {
		const result = renderReleaseRewrites({
			rewrites: {
				"pr-10769": {
					title:
						"Prevented duplicate session requests during React Suspense retries",
				},
			},
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.output).toContain(
			"Prevented duplicate session requests during React Suspense retries",
		);
		expect(result.output).toContain("## `better-auth`");
		expect(result.output).toContain("@bytaesu");
	});

	it("rejects a missing rewrite", () => {
		const result = renderReleaseRewrites({ rewrites: {} });

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"AI rewrite keys did not match the manifest",
		);
	});

	it("rejects an unknown rewrite", () => {
		const result = renderReleaseRewrites({
			rewrites: {
				"pr-10769": { title: "Fixed duplicate requests" },
				"pr-99999": { title: "Added an unrelated change" },
			},
		});

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"AI rewrite keys did not match the manifest",
		);
	});

	it("rejects unsupported fields at the schema boundary", () => {
		const result = renderReleaseRewrites({
			rewrites: {
				"pr-10769": {
					title: "Fixed duplicate requests",
					body: "Attempt to replace deterministic release structure",
				},
			},
		});

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"AI rewrite output must contain a valid rewrites object",
		);
	});

	it("rejects migration copy for a non-breaking change", () => {
		const result = renderReleaseRewrites({
			rewrites: {
				"pr-10769": {
					title: "Fixed duplicate requests",
					migration: "Change an unrelated setting",
				},
			},
		});

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"Non-breaking AI rewrite pr-10769 cannot have a migration",
		);
	});

	it("requires migration copy for a breaking change", () => {
		const result = renderReleaseRewrites(
			{
				rewrites: {
					"pr-10769": { title: "Changed session refresh behavior" },
				},
			},
			true,
		);

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"Breaking AI rewrite pr-10769 must have a single-line migration",
		);
	});

	it("renders migration copy for a breaking change", () => {
		const result = renderReleaseRewrites(
			{
				rewrites: {
					"pr-10769": {
						title: "Changed session refresh behavior",
						migration: "Update custom session refresh integrations.",
					},
				},
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
			rewrites: { "pr-10769": { title } },
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.output).toContain(title);
	});

	it.each([
		"Read https://example.com before upgrading",
		"See [the migration guide](https://example.com)",
		"Notify @maintainers before upgrading",
		"<img src=x onerror=alert(1)>",
	])("rejects unsafe AI copy: %s", (title) => {
		const result = renderReleaseRewrites({
			rewrites: { "pr-10769": { title } },
		});

		expect(result.status).toBe(1);
		expect(result.output).toBeNull();
		expect(result.stderr).toContain(
			"AI rewrite pr-10769 title contains unsafe markup",
		);
	});
});
