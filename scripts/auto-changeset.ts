#!/usr/bin/env node
/**
 * Auto-generates .changeset/*.md files from PR metadata.
 *
 * Modes:
 *   default:        Generate changeset + apply c-* label + commit (team PRs)
 *   --comment-only: Apply c-* label + post comment with changeset (fork PRs)
 *   --label-only:   Only apply the c-* label
 *
 * Environment:
 *   PR_NUMBER  - Pull request number
 *   PR_TITLE   - Pull request title (conventional commit format)
 *   BASE_REF   - Base branch name (main, next, release/*)
 *   GH_TOKEN   - GitHub token for API calls
 *
 * Usage:
 *   PR_NUMBER=8895 PR_TITLE="fix(stripe): ..." BASE_REF=main \
 *   npx tsx scripts/auto-changeset.ts
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	detectAffectedPackages,
	mapTypeToBump,
	parseConventionalCommit,
	resolveDomain,
} from "./lib/pr-analyzer.ts";

function exec(cmd: string): string {
	return execSync(cmd, { encoding: "utf-8" }).trim();
}

function getEnv(name: string): string {
	const val = process.env[name];
	if (!val) {
		console.error(`Missing required env var: ${name}`);
		process.exit(1);
	}
	return val;
}

function getChangedFiles(prNumber: string): string[] {
	try {
		return exec(`gh pr diff ${prNumber} --name-only`)
			.split("\n")
			.filter(Boolean);
	} catch {
		console.error("Failed to get PR diff");
		return [];
	}
}

function applyLabel(prNumber: string, domain: string): void {
	try {
		exec(`gh pr edit ${prNumber} --add-label ${domain}`);
		console.log(`Applied label: ${domain}`);
	} catch (err) {
		console.error(`Failed to apply label ${domain}:`, err);
	}
}

function hasExistingChangeset(prNumber: string): boolean {
	try {
		const diff = exec(`gh pr diff ${prNumber} --name-only`);
		return diff
			.split("\n")
			.some((f) => f.startsWith(".changeset/") && f.endsWith(".md"));
	} catch {
		return false;
	}
}

function hasSkipLabel(prNumber: string): boolean {
	try {
		const labels = exec(
			`gh pr view ${prNumber} --json labels --jq '.labels[].name'`,
		);
		return labels.split("\n").includes("skip-changeset");
	} catch {
		return false;
	}
}

function generateChangesetContent(
	packages: string[],
	bump: "patch" | "minor" | "major",
	subject: string,
): string {
	const header = packages.map((pkg) => `"${pkg}": ${bump}`).join("\n");
	return `---\n${header}\n---\n\n${subject}\n`;
}

function enforceBasePolicy(
	baseRef: string,
	bump: "patch" | "minor" | "major",
): "patch" | "minor" | "major" {
	if (baseRef === "main" && bump !== "patch") {
		console.log(
			`Base is main, downgrading ${bump} to patch (main is patch-only).`,
		);
		return "patch";
	}
	return bump;
}

function postStickyComment(prNumber: string, content: string): void {
	const marker = "<!-- auto-changeset -->";
	const body = `${marker}\n\n**Auto-generated changeset:**\n\n\`\`\`markdown\n${content}\`\`\`\n\nCopy this into a \`.changeset/*.md\` file to include it in the release.`;

	try {
		const comments = exec(
			`gh api repos/{owner}/{repo}/issues/${prNumber}/comments --jq '.[].body'`,
		);
		if (comments.includes(marker)) {
			const commentId = exec(
				`gh api repos/{owner}/{repo}/issues/${prNumber}/comments --jq '.[] | select(.body | contains("${marker}")) | .id'`,
			);
			if (commentId) {
				exec(
					`gh api repos/{owner}/{repo}/issues/comments/${commentId} -X PATCH -f body='${body.replace(/'/g, "'\\''")}'`,
				);
				console.log("Updated existing changeset comment.");
				return;
			}
		}
		exec(`gh pr comment ${prNumber} --body '${body.replace(/'/g, "'\\''")}'`);
		console.log("Posted changeset comment.");
	} catch (err) {
		console.error("Failed to post comment:", err);
	}
}

function main(): void {
	const prNumber = getEnv("PR_NUMBER");
	const prTitle = getEnv("PR_TITLE");
	const baseRef = getEnv("BASE_REF");

	const mode = process.argv.includes("--comment-only")
		? "comment-only"
		: process.argv.includes("--label-only")
			? "label-only"
			: "default";

	const parsed = parseConventionalCommit(prTitle);
	const changedFiles = getChangedFiles(prNumber);
	const domain = resolveDomain(parsed.scope, changedFiles);

	applyLabel(prNumber, domain);

	if (mode === "label-only") {
		console.log("Label-only mode, done.");
		return;
	}

	let bump = mapTypeToBump(parsed.type, parsed.breaking);
	if (bump === "skip") {
		console.log(`Type "${parsed.type}" does not require a changeset.`);
		return;
	}

	if (hasSkipLabel(prNumber)) {
		console.log("skip-changeset label found, skipping.");
		return;
	}

	if (hasExistingChangeset(prNumber)) {
		console.log("PR already contains a changeset, skipping.");
		return;
	}

	bump = enforceBasePolicy(baseRef, bump);
	const packages = detectAffectedPackages(changedFiles);

	if (packages.length === 0) {
		console.log("No publishable packages affected, skipping changeset.");
		return;
	}

	const content = generateChangesetContent(packages, bump, parsed.subject);

	if (mode === "comment-only") {
		postStickyComment(prNumber, content);
		return;
	}

	// Default mode: write file, commit, push
	const changesetDir = path.resolve(".changeset");
	if (!fs.existsSync(changesetDir)) {
		fs.mkdirSync(changesetDir, { recursive: true });
	}

	const filename = `pr-${prNumber}.md`;
	const filepath = path.join(changesetDir, filename);
	fs.writeFileSync(filepath, content);
	console.log(`Wrote ${filepath}`);

	try {
		exec(`git add ${filepath}`);
		exec(`git commit -m "chore: add changeset for PR #${prNumber}"`);
		exec("git push");
		console.log("Changeset committed and pushed.");
	} catch (err) {
		console.error("Failed to commit changeset:", err);
	}
}

try {
	main();
} catch (err) {
	console.error("auto-changeset failed:", err);
	process.exit(1);
}
