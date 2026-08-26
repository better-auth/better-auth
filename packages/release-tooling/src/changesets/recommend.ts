/**
 * Auto-changeset analysis — deterministic phase of changeset generation.
 *
 * Separated from the workflow so that secrets-dependent steps (AI, commit)
 * never execute code from the PR branch. This script runs from the base
 * branch checkout and fetches all PR data via the GitHub API.
 *
 * Usage: GITHUB_TOKEN=... PR_NUMBER=... pnpm auto-changeset
 */

import { setOutput } from "../actions-output.ts";
import { isMaintenanceBranch, mapTypeToBump } from "../change-classifier.ts";
import { parseConventionalHeader } from "../conventional-header.ts";
import type { GitHubReader } from "../github.ts";
import {
	createChangesetFallback,
	rewriteChangesetDescription,
} from "./rewrite.ts";

const CUBIC_OPEN = "<!-- This is an auto-generated description by cubic. -->";
const CUBIC_CLOSE = "<!-- End of auto-generated description by cubic. -->";

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

interface RecommendationOptions {
	force: boolean;
	output?: (name: string, value: string) => void;
	prNumber: number;
}

export async function recommendChangeset(
	github: GitHubReader,
	options: RecommendationOptions,
): Promise<void> {
	const { force, prNumber } = options;
	const output = options.output ?? setOutput;

	console.log(`Analyzing PR #${prNumber}`);

	const pr = await github.getPullRequest(prNumber);
	if (!pr) throw new Error(`Pull request #${prNumber} was not found`);

	// Promote PRs (next → main) already carry versioned changesets — skip entirely
	if (pr.headRef === "next" && pr.baseRef === "main" && !pr.isFork) {
		console.log("Skipping: promote PR (next → main) — already versioned");
		output("skip", "true");
		output(
			"skip_reason",
			"promote PR (next → main) already contains versioned changesets",
		);
		return;
	}

	const commit = parseConventionalHeader(pr.title);
	const bump = mapTypeToBump(commit.type, commit.breaking);
	const touchesPackages = pr.changedFiles.some(
		(file) =>
			file.startsWith("packages/") &&
			!file.startsWith("packages/release-tooling/"),
	);

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
	function skip(reason: string): void {
		console.log(`Skipping: ${reason}`);
		output("skip", "true");
		output("skip_reason", reason);
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
			output("has_existing", "true");
		}
		if (!touchesPackages) {
			return skip("no publishable package files changed");
		}
	}

	if (hasAutoChangeset) {
		output("has_existing", "true");
	}

	let resolvedBump = bump === "skip" ? "patch" : bump;

	const patchOnly = pr.baseRef === "main" || isMaintenanceBranch(pr.baseRef);
	if (patchOnly && resolvedBump !== "patch") {
		if (force) {
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
	const fallback = createChangesetFallback(
		cubicSummary || commit.subject || pr.title,
	);
	let description = fallback;
	try {
		description = await rewriteChangesetDescription({
			title: pr.title,
			bump: resolvedBump,
			changedFiles: pr.changedFiles.slice(0, 50),
			cubicSummary,
			diff: pr.diff,
		});
	} catch (error) {
		console.warn(
			`AI changeset rewrite failed; using deterministic fallback: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// All packages are in one changesets fixed group — listing any one
	// bumps them all together. "better-auth" is the representative.
	const frontmatter = `"better-auth": ${resolvedBump}`;

	console.log("Analysis complete:");
	output("skip", "false");
	output("bump", resolvedBump);
	output("frontmatter", frontmatter);
	output("pr_title", pr.title);
	output("cubic_summary", cubicSummary);
	output("fallback_description", fallback);
	output("description", description);
	output("changed_files", pr.changedFiles.slice(0, 50).join("\n"));
}
