/**
 * Auto-changeset analysis — deterministic phase of changeset generation.
 *
 * Separated from the workflow so that secrets-dependent steps (AI, commit)
 * never execute code from the PR branch. This script runs from the base
 * branch checkout and fetches all PR data via the GitHub API.
 *
 * Usage: GITHUB_TOKEN=... PR_NUMBER=... npx tsx .github/scripts/auto-changeset.ts
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
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

const REPO = process.env.GITHUB_REPOSITORY ?? "better-auth/better-auth";

const CUBIC_OPEN = "<!-- This is an auto-generated description by cubic. -->";
const CUBIC_CLOSE = "<!-- End of auto-generated description by cubic. -->";

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
		const delim = `GHEOF_${randomBytes(8).toString("hex")}`;
		appendFileSync(outputFile, `${key}<<${delim}\n${value}\n${delim}\n`);
	}
	console.log(
		`  ${key}: ${value.length > 100 ? `${value.slice(0, 100)}...` : value}`,
	);
}

// ── PR data fetching ───────────────────────────────────────────────────

function fetchPR(prNumber: number): PRData {
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
		REPO,
		"--json",
		"title,body,headRefName,baseRefName,labels,isCrossRepository",
	]);

	const filesRaw = gh([
		"api",
		`repos/${REPO}/pulls/${prNumber}/files`,
		"--paginate",
		"-q",
		".[] | .filename",
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

function hasPackageChanges(files: string[]): boolean {
	return files.some((f) => f.startsWith("packages/"));
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

	// Promote PRs (next → main) already carry versioned changesets — skip entirely
	if (pr.headRef === "next" && pr.baseRef === "main" && !pr.isFork) {
		console.log("Skipping: promote PR (next → main) — already versioned");
		setOutput("skip", "true");
		setOutput(
			"skip_reason",
			"promote PR (next → main) already contains versioned changesets",
		);
		return;
	}

	const commit = parseConventionalCommit(pr.title);
	const bump = mapTypeToBump(commit.type, commit.breaking);
	const touchesPackages = hasPackageChanges(pr.changedFiles);

	// Auto-generated changesets (pr-{N}.md) can be safely regenerated.
	// Only manually-created changesets (different filename) block re-generation.
	const autoChangesetPath = `.changeset/pr-${prNumber}.md`;
	const changesetFiles = pr.changedFiles.filter(
		(f) =>
			f.startsWith(".changeset/") &&
			f.endsWith(".md") &&
			!f.endsWith("README.md"),
	);
	const hasAutoChangeset = changesetFiles.includes(autoChangesetPath);
	const hasManualChangeset = changesetFiles.some(
		(f) => f !== autoChangesetPath,
	);

	// FORCE mode (set by /changeset command) bypasses most skip gates
	// but still respects hard constraints (no packages, policy violations)
	const force = process.env.FORCE === "true";

	function skip(reason: string): void {
		console.log(`Skipping: ${reason}`);
		setOutput("skip", "true");
		setOutput("skip_reason", reason);
	}

	if (!force) {
		if (hasManualChangeset) {
			return skip("manual changeset already exists");
		}
		if (pr.labels.includes("skip-changeset")) {
			return skip("skip-changeset label");
		}
		if (bump === "skip") {
			return skip(`type "${commit.type}" does not need a changeset`);
		}
		if (!touchesPackages) {
			return skip("no package files changed");
		}
	} else {
		console.log("FORCE mode: skip gates bypassed");
		if (hasManualChangeset) {
			setOutput("has_existing", "true");
		}
		if (!touchesPackages) {
			return skip("no package files changed — nothing to release");
		}
	}

	if (hasAutoChangeset) {
		setOutput("has_existing", "true");
	}

	let resolvedBump = bump === "skip" ? "patch" : bump;

	// main and release/* only accept patch
	const patchOnly = pr.baseRef === "main" || pr.baseRef.startsWith("release/");
	if (patchOnly && resolvedBump !== "patch") {
		if (force) {
			// In /changeset mode, cap to patch so the recommendation is always usable
			console.log(
				`Capping ${resolvedBump} to patch on ${pr.baseRef} (patch-only branch)`,
			);
			resolvedBump = "patch";
		} else {
			return skip(
				`${resolvedBump} bump on ${pr.baseRef} (patch only). Retarget this PR to next.`,
			);
		}
	}

	const cubicSummary = extractCubicSummary(pr.body);
	const humanBody = extractHumanBody(pr.body);
	const domain = resolveDomain(commit.scope, pr.changedFiles);
	const fallback = cubicSummary || commit.subject || pr.title;

	// All packages are in one changesets fixed group — listing any one
	// bumps them all together. "better-auth" is the representative.
	const frontmatter = `"better-auth": ${resolvedBump}`;

	console.log("Analysis complete:");
	setOutput("skip", "false");
	setOutput("bump", resolvedBump);
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
