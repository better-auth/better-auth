#!/usr/bin/env node
/**
 * PR Labeler — applies c-* domain labels to pull requests
 *
 * Usage:
 *   npx tsx scripts/label-pr.ts 8895
 *   npx tsx scripts/label-pr.ts --backfill --limit 50
 *   npx tsx scripts/label-pr.ts --backfill --dry-run
 *
 * Requires: gh CLI authenticated
 */

import { execFileSync } from "node:child_process";
import { parseConventionalCommit, resolveDomain } from "./lib/pr-analyzer.ts";

const REPO = process.env.GITHUB_REPOSITORY ?? "better-auth/better-auth";

interface PRInfo {
	number: number;
	title: string;
	labels: string[];
	files: string[];
}

function gh(...args: string[]): string {
	return execFileSync("gh", args, {
		encoding: "utf-8",
		timeout: 30_000,
	}).trim();
}

function getPRInfo(prNumber: number): PRInfo {
	const meta = JSON.parse(
		gh(
			"pr",
			"view",
			String(prNumber),
			"--repo",
			REPO,
			"--json",
			"number,title,labels",
		),
	);

	let files: string[];
	try {
		const filesJson = gh(
			"api",
			`repos/${REPO}/pulls/${prNumber}/files`,
			"--jq",
			"[.[].filename]",
		);
		files = JSON.parse(filesJson);
	} catch {
		files = [];
	}

	return {
		number: meta.number,
		title: meta.title,
		labels: meta.labels?.map((l: { name: string }) => l.name) ?? [],
		files,
	};
}

function classifyPR(pr: PRInfo): string {
	const { scope } = parseConventionalCommit(pr.title);
	return resolveDomain(scope || undefined, pr.files);
}

function hasDomainLabel(labels: string[]): boolean {
	return labels.some((l) => l.startsWith("c-"));
}

function applyLabel(prNumber: number, domain: string, dryRun: boolean): void {
	if (dryRun) return;
	try {
		gh("pr", "edit", String(prNumber), "--repo", REPO, "--add-label", domain);
	} catch (e) {
		console.error(`  Failed to label #${prNumber}: ${e}`);
	}
}

function labelSinglePR(prNumber: number, dryRun: boolean): void {
	const pr = getPRInfo(prNumber);
	const existingDomain = pr.labels.find((l) => l.startsWith("c-"));
	const domain = classifyPR(pr);
	const displayDomain = domain.replace("c-", "");

	if (existingDomain) {
		if (existingDomain === domain) {
			console.log(`  #${pr.number} already labeled ${existingDomain} ✓`);
		} else {
			console.log(
				`  #${pr.number} has ${existingDomain}, classified as ${domain} (skipping — manual override)`,
			);
		}
		return;
	}

	const prefix = dryRun ? "[dry-run] " : "";
	console.log(
		`  ${prefix}#${pr.number} → ${displayDomain}  ${pr.title.slice(0, 60)}`,
	);
	applyLabel(pr.number, domain, dryRun);
}

function backfill(limit: number, dryRun: boolean): void {
	let totalLabeled = 0;
	let totalSkipped = 0;
	let totalExisting = 0;

	const perPage = Math.min(limit, 100);

	const prs = JSON.parse(
		gh(
			"pr",
			"list",
			"--repo",
			REPO,
			"--state",
			"merged",
			"--limit",
			String(perPage),
			"--json",
			"number,title,labels",
		),
	);

	for (const pr of prs) {
		if (totalLabeled >= limit) break;

		const labels: string[] =
			pr.labels?.map((l: { name: string }) => l.name) ?? [];

		if (hasDomainLabel(labels)) {
			totalExisting++;
			continue;
		}

		let files: string[];
		try {
			const filesJson = gh(
				"api",
				`repos/${REPO}/pulls/${pr.number}/files`,
				"--jq",
				"[.[].filename]",
			);
			files = JSON.parse(filesJson);
		} catch {
			files = [];
			totalSkipped++;
			continue;
		}

		const prInfo: PRInfo = {
			number: pr.number,
			title: pr.title,
			labels,
			files,
		};

		const domain = classifyPR(prInfo);
		const displayDomain = domain.replace("c-", "");

		const prefix = dryRun ? "[dry-run] " : "";
		console.log(
			`  ${prefix}#${pr.number} → ${displayDomain}  ${pr.title.slice(0, 55)}`,
		);

		applyLabel(pr.number, domain, dryRun);
		totalLabeled++;

		if (!dryRun && totalLabeled % 10 === 0) {
			console.log(
				`  ... ${totalLabeled} labeled, ${totalExisting} already had labels`,
			);
		}
	}

	console.log("");
	console.log(
		`Done: ${totalLabeled} labeled, ${totalExisting} already had labels, ${totalSkipped} skipped`,
	);
}

// --- CLI ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const isBackfill = args.includes("--backfill");
const limitFlag = args.indexOf("--limit");
const limit =
	limitFlag >= 0 ? Number.parseInt(args[limitFlag + 1] ?? "50", 10) : 50;

if (isBackfill) {
	console.log(
		`Backfill: labeling up to ${limit} unlabeled merged PRs${dryRun ? " (dry run)" : ""}`,
	);
	console.log("");
	backfill(limit, dryRun);
} else {
	const prNumber = Number.parseInt(
		args.find((a) => /^\d+$/.test(a)) ?? "",
		10,
	);
	if (!prNumber) {
		console.error("Usage: npx tsx scripts/label-pr.ts <PR_NUMBER>");
		console.error(
			"       npx tsx scripts/label-pr.ts --backfill [--limit N] [--dry-run]",
		);
		process.exit(1);
	}
	labelSinglePR(prNumber, dryRun);
}
