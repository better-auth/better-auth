import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findPreviousTag } from "../src/release-notes/collect.ts";
import {
	parseSchema,
	releaseManifestSchema,
} from "../src/release-notes/schema.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const releaseNotesScript = resolve(
	import.meta.dirname,
	"../src/commands/release-notes.ts",
);

interface CommandResult {
	actionsOutput?: string;
	status: number | null;
	stderr: string;
	stdout: string;
}

interface CollectOptions {
	branch?: string;
	commitRef?: string;
	workspace?: string;
}

function collectReleaseNotes(
	version: string,
	options: CollectOptions = {},
): CommandResult {
	const workspace = options.workspace ?? repositoryRoot;
	const releaseCommit = spawnSync("git", ["rev-parse", "v" + version], {
		cwd: workspace,
		encoding: "utf-8",
	});
	if (!options.commitRef && releaseCommit.status !== 0) {
		throw new Error(releaseCommit.stderr);
	}
	const commitRef = options.commitRef ?? releaseCommit.stdout.trim();

	const result = spawnSync(
		process.execPath,
		[
			releaseNotesScript,
			"collect",
			"--version",
			version,
			"--branch",
			options.branch ?? "v" + version,
			"--commit-ref",
			commitRef,
			"--dry-run",
		],
		{
			cwd: workspace,
			encoding: "utf-8",
			env: {
				...process.env,
				GH_TOKEN: "",
				GITHUB_TOKEN: "",
				GITHUB_REPOSITORY: "better-auth/better-auth",
				GITHUB_SHA: commitRef,
				GITHUB_WORKSPACE: workspace,
			},
		},
	);
	return {
		status: result.status,
		stderr: result.stderr,
		stdout: result.stdout,
	};
}

function detectReleaseCandidate(
	version: string,
	branch: string,
	workspace: string,
): CommandResult {
	const outputDirectory = mkdtempSync(resolve(tmpdir(), "release-output-"));
	const outputPath = resolve(outputDirectory, "output");
	writeFileSync(outputPath, "");
	const result = spawnSync(
		process.execPath,
		[releaseNotesScript, "candidate", "--version", version, "--branch", branch],
		{
			cwd: workspace,
			encoding: "utf-8",
			env: {
				...process.env,
				GITHUB_OUTPUT: outputPath,
				GITHUB_WORKSPACE: workspace,
			},
		},
	);
	try {
		return {
			actionsOutput: existsSync(outputPath)
				? readFileSync(outputPath, "utf-8")
				: "",
			status: result.status,
			stderr: result.stderr,
			stdout: result.stdout,
		};
	} finally {
		rmSync(outputDirectory, { recursive: true });
	}
}

function git(workspace: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd: workspace,
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function checkReleaseChangesets(workspace: string): CommandResult {
	const result = spawnSync(
		process.execPath,
		[releaseNotesScript, "check-changesets", "--branch", "HEAD"],
		{
			cwd: workspace,
			encoding: "utf-8",
			env: { ...process.env, GITHUB_WORKSPACE: workspace },
		},
	);
	return {
		status: result.status,
		stderr: result.stderr,
		stdout: result.stdout,
	};
}

function writeFixtureFile(
	workspace: string,
	path: string,
	content: string,
): void {
	const file = resolve(workspace, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

function createChangesetStateFixture(
	changesets: string[],
	consumed?: string[],
): string {
	const workspace = mkdtempSync(resolve(tmpdir(), "release-changesets-"));
	git(workspace, ["init", "--initial-branch=main"]);
	git(workspace, ["config", "user.email", "release-test@example.com"]);
	git(workspace, ["config", "user.name", "Release Test"]);
	git(workspace, ["config", "commit.gpgsign", "false"]);
	writeFixtureFile(workspace, ".changeset/README.md", "# Changesets");
	for (const changeset of changesets) {
		writeFixtureFile(
			workspace,
			`.changeset/${changeset}.md`,
			["---", '"better-auth": patch', "---", "", changeset].join("\n"),
		);
	}
	if (consumed) {
		writeFixtureFile(
			workspace,
			".changeset/pre.json",
			JSON.stringify({ changesets: consumed }),
		);
	}
	git(workspace, ["add", "."]);
	git(workspace, ["commit", "-m", "chore: create changeset fixture"]);
	return workspace;
}

interface ReleaseFixtureOptions {
	mergeVersionPR?: boolean;
	consumeLaterChangeset?: boolean;
	splitVersionCommit?: boolean;
	separateChangesetCommit?: boolean;
	staleReleaseTag?: boolean;
	uppercaseChangesetId?: boolean;
}

function createReleaseWithFollowUpCommit(options: ReleaseFixtureOptions = {}): {
	commitRef: string;
	workspace: string;
} {
	const workspace = mkdtempSync(resolve(tmpdir(), "release-collection-"));
	git(workspace, ["init", "--initial-branch=main"]);
	git(workspace, ["config", "user.email", "release-test@example.com"]);
	git(workspace, ["config", "user.name", "Release Test"]);
	git(workspace, ["config", "commit.gpgsign", "false"]);

	writeFixtureFile(
		workspace,
		"packages/better-auth/package.json",
		JSON.stringify({ name: "better-auth", version: "1.0.0" }),
	);
	writeFixtureFile(
		workspace,
		"packages/better-auth/README.md",
		"# Better Auth",
	);
	git(workspace, ["add", "."]);
	git(workspace, ["commit", "-m", "chore: initialize release fixture"]);
	git(workspace, ["tag", "v1.0.0"]);
	if (options.staleReleaseTag) git(workspace, ["tag", "v2.0.0"]);
	git(workspace, ["switch", "-c", "version-pr"]);
	const changesetId = options.uppercaseChangesetId
		? "parseSetCookieHeader-value-validation"
		: options.separateChangesetCommit
			? "standalone-description"
			: "pr-42";
	const changesetPath = `.changeset/${changesetId}.md`;
	const changesetDescription = options.separateChangesetCommit
		? "Require explicit migration"
		: "Require an explicit migration after the release.";

	writeFixtureFile(
		workspace,
		changesetPath,
		["---", '"better-auth": major', "---", "", changesetDescription].join("\n"),
	);
	if (options.separateChangesetCommit) {
		git(workspace, ["add", "."]);
		git(workspace, ["commit", "-m", "chore: add release changeset"]);
	}
	writeFixtureFile(
		workspace,
		"packages/better-auth/src/session.ts",
		"export const session = true;",
	);
	git(workspace, ["add", "."]);
	git(workspace, [
		"commit",
		"-m",
		"fix(session): require explicit migration (#42)",
	]);

	rmSync(resolve(workspace, changesetPath));
	if (options.splitVersionCommit) {
		git(workspace, ["add", "."]);
		git(workspace, ["commit", "-m", "chore: consume release changeset"]);
	}
	writeFixtureFile(
		workspace,
		"packages/better-auth/package.json",
		JSON.stringify({ name: "better-auth", version: "2.0.0" }),
	);
	git(workspace, ["add", "."]);
	git(workspace, ["commit", "-m", "chore: release v2.0.0"]);

	if (options.consumeLaterChangeset) {
		writeFixtureFile(
			workspace,
			".changeset/pr-99.md",
			[
				"---",
				'"better-auth": patch',
				"---",
				"",
				"Unrelated follow-up changeset.",
			].join("\n"),
		);
		git(workspace, ["add", "."]);
		git(workspace, ["commit", "-m", "chore: add follow-up changeset"]);
		rmSync(resolve(workspace, ".changeset/pr-99.md"));
		git(workspace, ["add", "."]);
		git(workspace, ["commit", "-m", "chore: consume follow-up changeset"]);
	}

	if (options.mergeVersionPR) {
		git(workspace, ["switch", "main"]);
		git(workspace, [
			"merge",
			"--no-ff",
			"version-pr",
			"-m",
			"chore: merge version PR",
		]);
	}

	writeFixtureFile(workspace, "release-follow-up.md", "Reviewed release copy.");
	git(workspace, ["add", "."]);
	git(workspace, ["commit", "-m", "docs: review release copy"]);

	return { commitRef: git(workspace, ["rev-parse", "HEAD"]), workspace };
}

function validateReleaseVersion(version: string): CommandResult {
	const result = spawnSync(
		process.execPath,
		[releaseNotesScript, "validate", "--version", version],
		{ cwd: repositoryRoot, encoding: "utf-8" },
	);
	return {
		status: result.status,
		stderr: result.stderr,
		stdout: result.stdout,
	};
}

describe("release version validation", () => {
	it("uses strict semver validation", () => {
		expect(validateReleaseVersion("1.8.0-beta.1").status).toBe(0);
		expect(validateReleaseVersion("1.8.0-beta.01").status).toBe(1);
		expect(validateReleaseVersion("v1.8.0").status).toBe(1);
	});
});

describe("release manifest validation", () => {
	it("rejects releases without visible entries", () => {
		expect(() =>
			parseSchema(
				releaseManifestSchema,
				{
					repository: "better-auth/better-auth",
					version: "1.8.0",
					commitRef: "abc123",
					entries: [],
					previousTag: "v1.7.2",
					packageMetadata: {},
				},
				"Invalid release manifest",
			),
		).toThrow("expected array to have >=1 items");
	});
});

describe("release changeset readiness", () => {
	it("rejects pending stable changesets", () => {
		const workspace = createChangesetStateFixture(["pending-change"]);
		try {
			const result = checkReleaseChangesets(workspace);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("pending-change");
		} finally {
			rmSync(workspace, { recursive: true });
		}
	});

	it("accepts changesets already consumed by a prerelease", () => {
		const workspace = createChangesetStateFixture(
			["included-change"],
			["included-change"],
		);
		try {
			const result = checkReleaseChangesets(workspace);
			expect(result.status, result.stderr).toBe(0);
		} finally {
			rmSync(workspace, { recursive: true });
		}
	});

	it("rejects new changesets added after a prerelease", () => {
		const workspace = createChangesetStateFixture(
			["included-change", "pending-change"],
			["included-change"],
		);
		try {
			const result = checkReleaseChangesets(workspace);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("pending-change");
			expect(result.stderr).not.toContain("included-change");
		} finally {
			rmSync(workspace, { recursive: true });
		}
	});
});

describe("release changeset collection", () => {
	it("selects the previous stable and prerelease tags", () => {
		expect(findPreviousTag("1.7.1", false, "v1.7.1")).toBe("v1.7.0");
		expect(findPreviousTag("1.7.0-beta.0", true, "v1.7.0-beta.0")).toBe(
			"v1.6.2",
		);
		expect(findPreviousTag("1.7.0-rc.0", true, "v1.7.0-rc.0")).toBe(
			"v1.7.0-beta.10",
		);
		expect(findPreviousTag("1.7.0-rc.6", true, "v1.7.0-rc.6")).toBe(
			"v1.7.0-rc.5",
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/releases/tag/v1.6.28
	 */
	it("uses only changesets consumed by the release commit", () => {
		const result = collectReleaseNotes("1.6.28");

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("## `better-auth`");
		expect(result.stdout).toContain("## `@better-auth/electron`");
		expect(result.stdout).toContain("## `@better-auth/expo`");
		expect(result.stdout).not.toContain("## `@better-auth/sso`");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/releases/tag/v1.7.1
	 */
	it("preserves every package declared by a consumed changeset", () => {
		const result = collectReleaseNotes("1.7.1");
		const packageHeadings = result.stdout.match(/^## `[^`]+`(?: ✨)?$/gm);

		expect(result.status, result.stderr).toBe(0);
		expect(packageHeadings).toEqual(["## `better-auth`", "## `auth`"]);
	});

	it("finds consumed changesets before release follow-up commits", () => {
		const fixture = createReleaseWithFollowUpCommit();
		try {
			const result = collectReleaseNotes("2.0.0", {
				branch: "HEAD",
				commitRef: fixture.commitRef,
				workspace: fixture.workspace,
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("### ❗ Breaking Changes");
			expect(result.stdout).toContain(
				"Require an explicit migration after the release.",
			);
			expect(result.stdout).toContain('"changeType": "breaking"');
		} finally {
			rmSync(fixture.workspace, { recursive: true });
		}
	});

	it("ignores later changeset deletions that did not create the version", () => {
		const fixture = createReleaseWithFollowUpCommit({
			consumeLaterChangeset: true,
		});
		try {
			const result = collectReleaseNotes("2.0.0", {
				branch: "HEAD",
				commitRef: fixture.commitRef,
				workspace: fixture.workspace,
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain(
				"Require an explicit migration after the release.",
			);
			expect(result.stdout).toContain('"changeType": "breaking"');
		} finally {
			rmSync(fixture.workspace, { recursive: true });
		}
	});

	it("finds changesets consumed inside a merged version PR", () => {
		const fixture = createReleaseWithFollowUpCommit({ mergeVersionPR: true });
		try {
			const result = collectReleaseNotes("2.0.0", {
				branch: "HEAD",
				commitRef: fixture.commitRef,
				workspace: fixture.workspace,
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain(
				"Require an explicit migration after the release.",
			);
			expect(result.stdout).toContain('"changeType": "breaking"');
		} finally {
			rmSync(fixture.workspace, { recursive: true });
		}
	});

	it("finds changesets deleted before the version transition", () => {
		const fixture = createReleaseWithFollowUpCommit({
			splitVersionCommit: true,
		});
		try {
			const result = collectReleaseNotes("2.0.0", {
				branch: "HEAD",
				commitRef: fixture.commitRef,
				workspace: fixture.workspace,
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain(
				"Require an explicit migration after the release.",
			);
			expect(result.stdout).toContain('"changeType": "breaking"');
		} finally {
			rmSync(fixture.workspace, { recursive: true });
		}
	});

	it("uses an explicit commit ref even when a stale version tag exists", () => {
		const fixture = createReleaseWithFollowUpCommit({ staleReleaseTag: true });
		try {
			const result = collectReleaseNotes("2.0.0", {
				branch: "HEAD",
				commitRef: fixture.commitRef,
				workspace: fixture.workspace,
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain(
				"Require an explicit migration after the release.",
			);
		} finally {
			rmSync(fixture.workspace, { recursive: true });
		}
	});

	it("matches standalone changesets to PR subjects without their suffix", () => {
		const fixture = createReleaseWithFollowUpCommit({
			separateChangesetCommit: true,
		});
		try {
			const result = collectReleaseNotes("2.0.0", {
				branch: "HEAD",
				commitRef: fixture.commitRef,
				workspace: fixture.workspace,
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("Found 1 entries");
			expect(result.stdout).toContain("Require explicit migration");
		} finally {
			rmSync(fixture.workspace, { recursive: true });
		}
	});

	it("preserves mixed-case changeset identifiers", () => {
		const fixture = createReleaseWithFollowUpCommit({
			uppercaseChangesetId: true,
		});
		try {
			const result = collectReleaseNotes("2.0.0", {
				branch: "HEAD",
				commitRef: fixture.commitRef,
				workspace: fixture.workspace,
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain(
				"Require an explicit migration after the release.",
			);
		} finally {
			rmSync(fixture.workspace, { recursive: true });
		}
	});

	it("keeps an untagged version eligible across later retry commits", () => {
		const fixture = createReleaseWithFollowUpCommit();
		try {
			const candidate = detectReleaseCandidate(
				"2.0.0",
				fixture.commitRef,
				fixture.workspace,
			);

			expect(candidate.status, candidate.stderr).toBe(0);
			expect(candidate.actionsOutput).toMatch(/release<<[^\n]+\ntrue\n/);
			expect(candidate.actionsOutput).toMatch(
				/version_commit<<[^\n]+\n[a-f0-9]{40}\n/,
			);

			git(fixture.workspace, ["tag", "v2.0.0", fixture.commitRef]);
			const published = detectReleaseCandidate(
				"2.0.0",
				fixture.commitRef,
				fixture.workspace,
			);
			expect(published.status, published.stderr).toBe(0);
			expect(published.actionsOutput).toMatch(/release<<[^\n]+\nfalse\n/);
		} finally {
			rmSync(fixture.workspace, { recursive: true });
		}
	});
});
