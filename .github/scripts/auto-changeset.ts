// cSpell:words GHEOF
/**
 * Auto-changeset analysis — deterministic phase of changeset generation.
 *
 * Runs skip gates, parses the conventional commit, detects packages,
 * extracts PR context (cubic summary, human body), and outputs everything
 * via GITHUB_OUTPUT for subsequent workflow steps.
 *
 * Does NOT generate descriptions or commit — those happen in the workflow
 * via claude-code-action (AI) and shell steps (commit).
 *
 * Usage: GITHUB_TOKEN=... PR_NUMBER=... npx tsx .github/scripts/auto-changeset.ts
 */

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import {
	mapTypeToBump,
	parseConventionalCommit,
	resolveDomain,
} from "./pr-analyzer.js";

// ── Types ──────────────────────────────────────────────────────────────

interface PRData {
	number: number;
	title: string;
	body: string;
	headRef: string;
	baseRef: string;
	labels: string[];
	isFork: boolean;
	changedFiles: string[];
}

// ── Constants ──────────────────────────────────────────────────────────

const CUBIC_OPEN = "<!-- This is an auto-generated description by cubic. -->";
const CUBIC_CLOSE = "<!-- End of auto-generated description by cubic. -->";

const DIR_TO_PACKAGE: [string, string][] = [
	["packages/api-key/", "@better-auth/api-key"],
	["packages/better-auth/", "better-auth"],
	["packages/cli/", "auth"],
	["packages/core/", "@better-auth/core"],
	["packages/drizzle-adapter/", "@better-auth/drizzle-adapter"],
	["packages/electron/", "@better-auth/electron"],
	["packages/expo/", "@better-auth/expo"],
	["packages/i18n/", "@better-auth/i18n"],
	["packages/kysely-adapter/", "@better-auth/kysely-adapter"],
	["packages/memory-adapter/", "@better-auth/memory-adapter"],
	["packages/mongo-adapter/", "@better-auth/mongo-adapter"],
	["packages/oauth-provider/", "@better-auth/oauth-provider"],
	["packages/passkey/", "@better-auth/passkey"],
	["packages/prisma-adapter/", "@better-auth/prisma-adapter"],
	["packages/redis-storage/", "@better-auth/redis-storage"],
	["packages/scim/", "@better-auth/scim"],
	["packages/sso/", "@better-auth/sso"],
	["packages/stripe/", "@better-auth/stripe"],
	["packages/telemetry/", "@better-auth/telemetry"],
	["packages/test-utils/", "@better-auth/test-utils"],
];

// ── GitHub CLI helpers ─────────────────────────────────────────────────

function gh(args: string[]): string {
	return execFileSync("gh", args, {
		encoding: "utf-8",
		env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
	}).trim();
}

function ghJSON<T>(args: string[]): T {
	return JSON.parse(gh(args)) as T;
}

// ── GITHUB_OUTPUT helpers ──────────────────────────────────────────────

function setOutput(key: string, value: string): void {
	const outputFile = process.env.GITHUB_OUTPUT;
	if (outputFile) {
		// Use heredoc format for safe multi-line values
		appendFileSync(outputFile, `${key}<<GHEOF\n${value}\nGHEOF\n`);
	}
	console.log(
		`  ${key}: ${value.length > 100 ? `${value.slice(0, 100)}...` : value}`,
	);
}

// ── PR data fetching ───────────────────────────────────────────────────

function fetchPR(prNumber: number): PRData {
	const repo = process.env.GITHUB_REPOSITORY ?? "better-auth/better-auth";

	const pr = ghJSON<{
		title: string;
		body: string;
		headRefName: string;
		baseRefName: string;
		labels: { name: string }[];
		isCrossRepository: boolean;
	}>([
		"pr",
		"view",
		String(prNumber),
		"--repo",
		repo,
		"--json",
		"title,body,headRefName,baseRefName,labels,isCrossRepository",
	]);

	const filesRaw = gh([
		"api",
		`repos/${repo}/pulls/${prNumber}/files`,
		"--paginate",
		"--jq",
		".[].filename",
	]);
	const files = filesRaw ? filesRaw.split("\n").filter(Boolean) : [];

	return {
		number: prNumber,
		title: pr.title,
		body: pr.body ?? "",
		headRef: pr.headRefName,
		baseRef: pr.baseRefName,
		labels: pr.labels.map((l) => l.name),
		isFork: pr.isCrossRepository,
		changedFiles: files,
	};
}

// ── Cubic extraction ───────────────────────────────────────────────────

function extractCubicSummary(body: string): string {
	const start = body.indexOf(CUBIC_OPEN);
	const end = body.indexOf(CUBIC_CLOSE);
	if (start === -1 || end === -1) return "";

	const block = body.slice(start + CUBIC_OPEN.length, end).trim();
	const cleaned = block
		.replace(/^---\s*\n/, "")
		.replace(/^## Summary by cubic\s*\n+/, "");

	const summaryEnd = cleaned.search(/\n\s*- (\*\*|\w)|<sup>/);
	return (summaryEnd === -1 ? cleaned : cleaned.slice(0, summaryEnd)).trim();
}

function extractHumanBody(body: string): string {
	const cubicStart = body.indexOf(CUBIC_OPEN);
	const human = cubicStart === -1 ? body : body.slice(0, cubicStart);
	return human.replace(/closes?\s+#\d+/gi, "").trim();
}

// ── Package detection ──────────────────────────────────────────────────

function detectPackages(files: string[]): string[] {
	const packages = new Set<string>();
	for (const file of files) {
		for (const [prefix, pkg] of DIR_TO_PACKAGE) {
			if (file.startsWith(prefix)) {
				packages.add(pkg);
				break;
			}
		}
	}
	return [...packages];
}

// ── Existing changeset detection ───────────────────────────────────────

function hasExistingChangeset(prNumber: number): boolean {
	const repo = process.env.GITHUB_REPOSITORY ?? "better-auth/better-auth";
	try {
		const diffFiles = gh([
			"pr",
			"diff",
			String(prNumber),
			"--repo",
			repo,
			"--name-only",
		]);
		return diffFiles
			.split("\n")
			.some(
				(f) =>
					f.startsWith(".changeset/") &&
					f.endsWith(".md") &&
					!f.endsWith("README.md"),
			);
	} catch {
		return false;
	}
}

// ── Skip gate helpers ──────────────────────────────────────────────────

function addLabel(prNumber: number, label: string): void {
	const repo = process.env.GITHUB_REPOSITORY ?? "better-auth/better-auth";
	try {
		gh(["pr", "edit", String(prNumber), "--repo", repo, "--add-label", label]);
	} catch {
		// Label might not exist yet
	}
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
	const prNumber = Number(process.env.PR_NUMBER);
	if (!prNumber) {
		console.error("PR_NUMBER environment variable required");
		process.exit(1);
	}

	console.log(`Analyzing PR #${prNumber}`);

	const pr = fetchPR(prNumber);
	const commit = parseConventionalCommit(pr.title);
	const bump = mapTypeToBump(commit.type, commit.breaking);
	const packages = detectPackages(pr.changedFiles);
	const existingChangeset = hasExistingChangeset(prNumber);

	// ── Skip gates ──

	if (existingChangeset) {
		console.log("Skipping: changeset already exists");
		setOutput("skip", "true");
		return;
	}
	if (pr.labels.includes("skip-changeset")) {
		console.log("Skipping: skip-changeset label");
		setOutput("skip", "true");
		return;
	}
	if (bump === "skip") {
		console.log(`Skipping: type "${commit.type}" does not need a changeset`);
		setOutput("skip", "true");
		addLabel(prNumber, "skip-changeset");
		return;
	}
	if (packages.length === 0) {
		console.log("Skipping: no package files changed");
		setOutput("skip", "true");
		addLabel(prNumber, "skip-changeset");
		return;
	}

	// ── Enforce branch policy ──

	const effectiveBump =
		pr.baseRef === "main" || pr.baseRef.startsWith("release/")
			? ("patch" as const)
			: bump;

	// ── Extract context ──

	const cubicSummary = extractCubicSummary(pr.body);
	const humanBody = extractHumanBody(pr.body);
	const domain = resolveDomain(commit.scope, pr.changedFiles);
	const fallback = cubicSummary || commit.subject || pr.title;

	// ── Build changeset frontmatter ──

	const frontmatter = packages
		.map((pkg) => `"${pkg}": ${effectiveBump}`)
		.join("\n");

	// ── Output everything ──

	console.log("Analysis complete:");
	setOutput("skip", "false");
	setOutput("bump", effectiveBump);
	setOutput("packages", JSON.stringify(packages));
	setOutput("frontmatter", frontmatter);
	setOutput("domain", domain);
	setOutput("is_fork", String(pr.isFork));
	setOutput("head_ref", pr.headRef);
	setOutput("pr_title", pr.title);
	setOutput("cubic_summary", cubicSummary);
	setOutput("human_body", humanBody);
	setOutput("fallback_description", fallback);
	setOutput("changed_files", pr.changedFiles.slice(0, 50).join("\n"));
}

main();
