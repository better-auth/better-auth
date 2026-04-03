#!/usr/bin/env node
/**
 * Rewrites GitHub Release body with domain-categorized notes.
 *
 * Runs as a post-publish step in release.yml.
 * Reads PUBLISHED_PACKAGES env var from changesets/action output.
 *
 * Usage:
 *   PUBLISHED_PACKAGES='[{"name":"better-auth","version":"1.6.0"}]' \
 *   GH_TOKEN=... \
 *   npx tsx scripts/release-notes.ts
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Commit, ConventionalCommit } from "./lib/pr-analyzer.ts";
import {
	cancelReverts,
	DOMAIN_LABELS,
	DOMAIN_ORDER,
	mapTypeToBump,
	parseConventionalCommit,
	resolveDomain,
} from "./lib/pr-analyzer.ts";

interface PublishedPackage {
	name: string;
	version: string;
}

function exec(cmd: string): string {
	return execSync(cmd, { encoding: "utf-8" }).trim();
}

function getChangedFiles(hash: string): string[] {
	try {
		return exec(`git diff-tree --no-commit-id --name-only -r ${hash}`)
			.split("\n")
			.filter(Boolean);
	} catch {
		return [];
	}
}

interface ClassifiedCommit {
	parsed: ConventionalCommit;
	domain: string;
	hash: string;
	prNumber: string | undefined;
}

function extractPrNumber(subject: string): string | undefined {
	const match = subject.match(/\(#(\d+)\)$/);
	return match ? match[1] : undefined;
}

function isUserFacing(type: string): boolean {
	return mapTypeToBump(type, false) !== "skip";
}

function classifyCommits(range: string): ClassifiedCommit[] {
	const raw = exec(`git log --no-merges --oneline ${range}`);
	if (!raw) return [];

	const commits: Commit[] = raw
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const spaceIdx = line.indexOf(" ");
			return {
				hash: line.slice(0, spaceIdx),
				message: line.slice(spaceIdx + 1),
			};
		});

	const surviving = cancelReverts(commits);

	const classified: ClassifiedCommit[] = [];
	for (const commit of surviving) {
		const parsed = parseConventionalCommit(commit.message);
		if (!isUserFacing(parsed.type)) continue;

		const files = getChangedFiles(commit.hash);
		const domain = resolveDomain(parsed.scope, files);
		const prNumber = extractPrNumber(parsed.subject);

		classified.push({ parsed, domain, hash: commit.hash, prNumber });
	}

	return classified;
}

interface ContributorInfo {
	login: string;
	prNumber: string;
}

function getCommunityContributors(
	classified: ClassifiedCommit[],
): ContributorInfo[] {
	const contributors: ContributorInfo[] = [];
	const seen = new Set<string>();

	for (const commit of classified) {
		if (!commit.prNumber) continue;

		try {
			const json = exec(
				`gh api repos/{owner}/{repo}/pulls/${commit.prNumber} --jq '.author_association + " " + .user.login'`,
			);
			const [association, login] = json.split(" ");
			if (
				association !== "MEMBER" &&
				association !== "OWNER" &&
				login &&
				!seen.has(login)
			) {
				seen.add(login);
				contributors.push({ login, prNumber: commit.prNumber });
			}
		} catch {
			// Non-critical, skip
		}
	}

	return contributors;
}

function formatReleaseNotes(
	classified: ClassifiedCommit[],
	contributors: ContributorInfo[],
): string {
	const grouped = new Map<string, ClassifiedCommit[]>();
	for (const commit of classified) {
		const list = grouped.get(commit.domain) ?? [];
		list.push(commit);
		grouped.set(commit.domain, list);
	}

	const lines: string[] = [];

	for (const domain of DOMAIN_ORDER) {
		const commits = grouped.get(domain);
		if (!commits?.length) continue;

		const label = DOMAIN_LABELS[domain] ?? domain;
		lines.push(`### ${label}`);
		lines.push("");

		for (const commit of commits) {
			const pr = commit.prNumber ? ` (#${commit.prNumber})` : "";
			const prefix = commit.parsed.breaking ? "**BREAKING** " : "";
			lines.push(`- ${prefix}${commit.parsed.subject}${pr}`);
		}
		lines.push("");
	}

	if (contributors.length > 0) {
		lines.push("### New Contributors");
		lines.push("");
		for (const c of contributors) {
			lines.push(
				`- @${c.login} made their first contribution in #${c.prNumber}`,
			);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function main(): void {
	const publishedRaw = process.env.PUBLISHED_PACKAGES;
	if (!publishedRaw) {
		console.log("No PUBLISHED_PACKAGES env var, skipping release notes.");
		return;
	}

	let packages: PublishedPackage[];
	try {
		packages = JSON.parse(publishedRaw) as PublishedPackage[];
	} catch {
		console.error("Failed to parse PUBLISHED_PACKAGES");
		return;
	}

	const betterAuth = packages.find((p) => p.name === "better-auth");
	if (!betterAuth) {
		console.log("better-auth not in published packages, skipping.");
		return;
	}

	const tag = `better-auth@${betterAuth.version}`;
	console.log(`Generating release notes for ${tag}`);

	// Find previous tag
	let prevTag: string;
	try {
		const tags = exec("git tag --sort=-version:refname --list 'better-auth@*'")
			.split("\n")
			.filter(Boolean);
		const currentIdx = tags.indexOf(tag);
		if (currentIdx === -1 || currentIdx + 1 >= tags.length) {
			console.log("Could not find previous tag, skipping.");
			return;
		}
		prevTag = tags[currentIdx + 1]!;
	} catch {
		console.log("Failed to list tags, skipping.");
		return;
	}

	console.log(`Comparing ${prevTag}..${tag}`);

	const classified = classifyCommits(`${prevTag}..${tag}`);
	if (classified.length === 0) {
		console.log("No user-facing commits found.");
		return;
	}

	const contributors = getCommunityContributors(classified);
	const body = formatReleaseNotes(classified, contributors);

	const tmpFile = path.join(os.tmpdir(), `release-notes-${Date.now()}.md`);
	fs.writeFileSync(tmpFile, body);

	try {
		exec(`gh release edit ${tag} --notes-file ${tmpFile}`);
		console.log("Release notes updated.");
	} catch (err) {
		console.error("Failed to update release notes:", err);
	} finally {
		fs.unlinkSync(tmpFile);
	}
}

try {
	main();
} catch (err) {
	console.error("release-notes failed:", err);
	// Exit 0 to not block CI
}
