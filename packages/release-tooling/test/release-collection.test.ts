import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
			"--experimental-strip-types",
			releaseNotesScript,
			"collect",
			"--version",
			version,
			"--branch",
			options.branch ?? "v" + version,
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
				GITHUB_ACTIONS: "",
				PUBLISHED_PACKAGES: JSON.stringify([{ name: "better-auth", version }]),
			},
		},
	);
	return {
		status: result.status,
		stderr: result.stderr,
		stdout: result.stdout,
	};
}

function git(workspace: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd: workspace,
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
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

function createReleaseWithFollowUpCommit(): {
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

	writeFixtureFile(
		workspace,
		".changeset/pr-42.md",
		[
			"---",
			'"better-auth": major',
			"---",
			"",
			"Require an explicit migration after the release.",
		].join("\n"),
	);
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

	rmSync(resolve(workspace, ".changeset/pr-42.md"));
	writeFixtureFile(
		workspace,
		"packages/better-auth/package.json",
		JSON.stringify({ name: "better-auth", version: "2.0.0" }),
	);
	git(workspace, ["add", "."]);
	git(workspace, ["commit", "-m", "chore: release v2.0.0"]);

	writeFixtureFile(workspace, "release-follow-up.md", "Reviewed release copy.");
	git(workspace, ["add", "."]);
	git(workspace, ["commit", "-m", "docs: review release copy"]);

	return { commitRef: git(workspace, ["rev-parse", "HEAD"]), workspace };
}

function validateReleaseVersion(version: string): CommandResult {
	const result = spawnSync(
		process.execPath,
		[
			"--experimental-strip-types",
			releaseNotesScript,
			"validate",
			"--version",
			version,
		],
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

describe("release changeset collection", () => {
	it("selects the previous stable and prerelease tags", () => {
		expect(findPreviousTag("1.7.1", false)).toBe("v1.7.0");
		expect(findPreviousTag("1.7.0-rc.6", true)).toBe("v1.7.0-rc.5");
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
});
