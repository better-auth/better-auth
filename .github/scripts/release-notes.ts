/**
 * Release Notes — deterministic stage of release note generation.
 *
 * Reads changeset files and pre.json to collect entries, resolves PR metadata
 * via `gh` CLI for correct attribution and domain classification, then outputs
 * a raw structured changelog for the AI rewriting stage.
 *
 * This is stage 1 of a 2-stage pipeline:
 *   Stage 1 (this script): deterministic data extraction + domain classification
 *   Stage 2 (Claude in CI): rewrite descriptions to be user-focused
 *
 * CI:    PUBLISHED_PACKAGES='[...]' node .github/scripts/release-notes.ts
 * Local: node --experimental-strip-types .github/scripts/release-notes.ts \
 *          --version 1.6.0-beta.0 --branch origin/next --dry-run
 *
 * Revert-cancellation algorithm and two-stage AI pipeline adapted from
 * sst/opencode (MIT License, Copyright (c) 2025 opencode):
 *   https://github.com/anomalyco/opencode
 *   script/raw-changelog.ts, script/changelog.ts, script/version.ts
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ghJSON, REPO, setOutput } from "./lib/github.ts";
import {
	classifyChangeType,
	DOMAIN_ORDER,
	FILTERED_DOMAINS,
	parseConventionalCommit,
	resolveDomain,
	resolvePackage,
} from "./lib/pr-analyzer.ts";

// ── Types ──────────────────────────────────────────────────────────────

interface ReleaseEntry {
	id: string;
	description: string;
	prNumber: number | null;
	author: string;
	domain: string;
	packageName: string;
	changeType: "breaking" | "feat" | "fix";
	breaking: boolean;
}

interface PRInfo {
	author: string;
	title: string;
	labels: string[];
	files: string[];
}

interface ChangesetSnapshot {
	ids: string[];
	ref: string;
}

// ── Constants ──────────────────────────────────────────────────────────

// ── CLI argument parsing ───────────────────────────────────────────────

function parseArgs(): {
	version: string;
	branch: string;
	distTag: string;
	dryRun: boolean;
} {
	const args = process.argv.slice(2);
	let version = "";
	let branch = "";
	let distTag = "";
	let dryRun = false;

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--version":
				version = args[++i] ?? "";
				break;
			case "--branch":
				branch = args[++i] ?? "";
				break;
			case "--dist-tag":
				distTag = args[++i] ?? "";
				break;
			case "--dry-run":
				dryRun = true;
				break;
		}
	}

	if (!version) {
		const pkgs = process.env.PUBLISHED_PACKAGES;
		if (pkgs) {
			const parsed = JSON.parse(pkgs) as { name: string; version: string }[];
			version = parsed[0]?.version ?? "";
		}
	}

	if (!distTag) {
		distTag = process.env.NPM_DIST_TAG ?? "";
	}

	if (!version) {
		console.error(
			"Usage: release-notes.ts --version <ver> [--branch <ref>] [--dist-tag <tag>] [--dry-run]",
		);
		process.exit(1);
	}

	return { version, branch, distTag, dryRun };
}

// ── Git helpers ────────────────────────────────────────────────────────

function gitShow(ref: string, path: string): string {
	return execFileSync("git", ["show", `${ref}:${path}`], {
		encoding: "utf-8",
	});
}

function readFileFromRef(path: string, branch: string): string {
	if (branch) {
		return gitShow(branch, path);
	}
	return readFileSync(path, "utf-8");
}

function listTags(): string[] {
	const output = execFileSync(
		"git",
		["tag", "--sort=-version:refname", "--list", "v*"],
		{ encoding: "utf-8" },
	);
	return output.trim().split("\n").filter(Boolean);
}

// ── Previous tag resolution ────────────────────────────────────────────

/** Parse "1.2.3" into [1, 2, 3]. Returns null on invalid input. */
function parseVersionTuple(ver: string): [number, number, number] | null {
	const base = ver.replace(/-.*$/, "");
	const m = base.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!m) return null;
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True if a < b by major.minor.patch comparison. */
function isOlderVersion(a: string, b: string): boolean {
	const ta = parseVersionTuple(a);
	const tb = parseVersionTuple(b);
	if (!ta || !tb) return false;
	for (let i = 0; i < 3; i++) {
		if (ta[i]! < tb[i]!) return true;
		if (ta[i]! > tb[i]!) return false;
	}
	return false;
}

function findPreviousTag(currentVersion: string, isBeta: boolean): string {
	const tags = listTags();

	if (isBeta) {
		const preMatch = currentVersion.match(/^(.+)-(beta|alpha|rc)\.(\d+)$/);
		if (preMatch && Number(preMatch[3]) > 0) {
			const prevN = Number(preMatch[3]) - 1;
			const channel = preMatch[2];
			const prevVersion = `${preMatch[1]}-${channel}.${prevN}`;
			const prevTag = `v${prevVersion}`;
			if (tags.includes(prevTag)) return prevTag;
		}
	}

	const currentTag = `v${currentVersion}`;
	const majorMinorMatch = currentVersion.match(/^(\d+\.\d+)\./);
	const majorMinor = majorMinorMatch?.[1];

	// First prefer the same major.minor line, then fall back to any stable tag
	let fallback: string | undefined;
	for (const tag of tags) {
		if (tag === currentTag) continue;
		const ver = tag.replace(/^v/, "");
		if (ver.includes("-") || !isOlderVersion(ver, currentVersion)) continue;
		if (majorMinor && ver.startsWith(`${majorMinor}.`)) return tag;
		fallback ??= tag;
	}
	if (fallback) return fallback;

	throw new Error("No previous stable tag found");
}

// ── Changeset file parsing ─────────────────────────────────────────────

function parseChangesetFile(content: string): {
	packages: Record<string, string>;
	description: string;
} {
	const parts = content.split("---");
	if (parts.length < 3) {
		return { packages: {}, description: content.trim() };
	}

	const frontmatter = parts[1]!;
	const description = parts.slice(2).join("---").trim();

	const packages: Record<string, string> = {};
	for (const line of frontmatter.split("\n")) {
		const match = line.match(/^"?([^"]+)"?\s*:\s*(.+)$/);
		if (match) {
			packages[match[1]!.trim()] = match[2]!.trim();
		}
	}

	return { packages, description };
}

// ── PR metadata resolution ─────────────────────────────────────────────

const prCache = new Map<number, PRInfo>();
const releaseBodyCache = new Map<string, string | null>();

function fetchPR(prNumber: number): PRInfo {
	const cached = prCache.get(prNumber);
	if (cached) return cached;

	const data = ghJSON<{
		author: { login: string };
		title: string;
		labels: { name: string }[];
		files: { path: string }[];
	}>([
		"pr",
		"view",
		String(prNumber),
		"--repo",
		REPO,
		"--json",
		"author,title,labels,files",
	]);

	const info: PRInfo = {
		author: data.author.login,
		title: data.title,
		labels: data.labels.map((l) => l.name),
		files: data.files.map((f) => f.path),
	};

	prCache.set(prNumber, info);
	return info;
}

function fetchReleaseBody(tag: string): string | null {
	const cached = releaseBodyCache.get(tag);
	if (cached !== undefined) return cached;

	try {
		const data = ghJSON<{ body: string | null }>([
			"release",
			"view",
			tag,
			"--repo",
			REPO,
			"--json",
			"body",
		]);
		const body = data.body ?? "";
		releaseBodyCache.set(tag, body);
		return body;
	} catch {
		releaseBodyCache.set(tag, null);
		return null;
	}
}

function extractReleasePRNumbers(body: string): Set<string> {
	const prNumbers = new Set<string>();
	for (const match of body.matchAll(/\[#(\d+)\]\([^)]*\/pull\/\d+\)/g)) {
		prNumbers.add(match[1]!);
	}
	return prNumbers;
}

// ── Domain classification ──────────────────────────────────────────────

function classifyEntry(
	prInfo: PRInfo | null,
	scope: string | undefined,
	files: string[],
): string {
	if (prInfo) {
		for (const label of prInfo.labels) {
			if (DOMAIN_ORDER.includes(label as (typeof DOMAIN_ORDER)[number])) {
				return label;
			}
		}
	}

	return resolveDomain(scope, files);
}

// ── Changeset description index ────────────────────────────────────────

interface ChangesetEntry {
	id: string;
	description: string;
	breaking: boolean;
	packageNames: string[];
}

function findChangesetSourcePR(id: string, ref: string): number | null {
	try {
		const subject = execFileSync(
			"git",
			[
				"log",
				"--diff-filter=A",
				"--format=%s",
				"-n",
				"1",
				ref,
				"--",
				`.changeset/${id}.md`,
			],
			{ encoding: "utf-8" },
		).trim();
		const prMatch = subject.match(/\(#(\d+)\)$/);
		return prMatch ? Number(prMatch[1]) : null;
	} catch {
		return null;
	}
}

/** Build a map of PR number to changeset description from .changeset/ files and pre.json. */
function buildChangesetIndex(branch: string): {
	byPR: Map<number, ChangesetEntry>;
	orphans: ChangesetEntry[];
	byDescription: Map<string, ChangesetEntry>;
} {
	const byPR = new Map<number, ChangesetEntry>();
	const orphans: ChangesetEntry[] = [];
	const byDescription = new Map<string, ChangesetEntry>();

	const ids = new Set<string>();
	let hasPreJSON = false;

	try {
		const raw = readFileFromRef(".changeset/pre.json", branch);
		const preJSON = JSON.parse(raw) as { changesets: string[] };
		hasPreJSON = true;
		for (const id of preJSON.changesets) ids.add(id);
	} catch {
		// No pre.json — scan the directory instead
	}

	// Walk recent ancestors (including merge parents via rev-list's full graph
	// traversal) to find a commit that still has changeset files. On main after
	// promotion, `changeset version` deletes them, so we may need to look at
	// the merged next branch side.
	const skipFiles = new Set(["README", "config"]);
	const baseRef = branch || "HEAD";
	let effectiveBranch = branch;
	if (!hasPreJSON) {
		try {
			const revs = execFileSync(
				"git",
				["rev-list", "--max-count=15", baseRef],
				{
					encoding: "utf-8",
				},
			)
				.trim()
				.split("\n")
				.filter(Boolean);

			let bestSnapshot: ChangesetSnapshot | null = null;

			for (const rev of revs) {
				try {
					const listing = execFileSync(
						"git",
						["ls-tree", "-r", "--name-only", rev, ".changeset/"],
						{ encoding: "utf-8" },
					);
					const snapshotIds = listing
						.split("\n")
						.map((file) =>
							file.replace(/^\.changeset\//, "").replace(/\.md$/, ""),
						)
						.filter(
							(name) =>
								name && !skipFiles.has(name) && /^[a-z0-9-]+$/.test(name),
						);

					if (
						snapshotIds.length > 0 &&
						(!bestSnapshot || snapshotIds.length > bestSnapshot.ids.length)
					) {
						bestSnapshot = { ids: snapshotIds, ref: rev };
					}
				} catch {
					// listing failed — try next
				}
			}

			if (bestSnapshot) {
				effectiveBranch = bestSnapshot.ref;
				for (const id of bestSnapshot.ids) ids.add(id);
			}
		} catch {
			// rev-list failed — proceed with whatever pre.json gave us
		}
	}

	for (const id of ids) {
		try {
			const content = readFileFromRef(`.changeset/${id}.md`, effectiveBranch);
			const { packages, description } = parseChangesetFile(content);
			if (!description) continue;

			const breaking = Object.values(packages).some((b) => b === "major");
			const entry: ChangesetEntry = {
				id,
				description,
				breaking,
				packageNames: Object.keys(packages),
			};

			const prMatch = id.match(/^pr-(\d+)$/);
			if (prMatch) {
				byPR.set(Number(prMatch[1]), entry);
			} else {
				const sourcePrNumber = findChangesetSourcePR(id, effectiveBranch);
				if (sourcePrNumber && !byPR.has(sourcePrNumber)) {
					byPR.set(sourcePrNumber, entry);
				} else {
					orphans.push(entry);
					const firstLine = description.split("\n")[0]!.trim().toLowerCase();
					if (firstLine) byDescription.set(firstLine, entry);
				}
			}
		} catch {
			// File not found — skip
		}
	}

	return { byPR, orphans, byDescription };
}

function packageNameToPath(name: string): string {
	return `packages/${name.replace(/^@better-auth\//, "")}/`;
}

/** Load changeset IDs from the previous beta's pre.json to exclude from orphans. */
function loadPreviousPrereleaseChangesets(version: string): Set<string> {
	const preMatch = version.match(/^(.+)-(beta|alpha|rc)\.(\d+)$/);
	if (!preMatch || Number(preMatch[3]) === 0) return new Set();

	const channel = preMatch[2];
	const prevTag = `v${preMatch[1]}-${channel}.${Number(preMatch[3]) - 1}`;
	try {
		const prevPre = JSON.parse(gitShow(prevTag, ".changeset/pre.json")) as {
			changesets: string[];
		};
		return new Set(prevPre.changesets);
	} catch {
		return new Set();
	}
}

// ── Entry collection ───────────────────────────────────────────────────

/**
 * Collects release entries using git history as the ground truth,
 * enriched with changeset descriptions where available.
 *
 * Handles the cherry-pick history gap (where the previous tag is not
 * a direct ancestor) using PR-number deduplication, same as
 * release-previews.sh.
 */
function collectEntries(version: string, branch: string): ReleaseEntry[] {
	const previousTag = findPreviousTag(version, version.includes("-"));

	const currentTag = `v${version}`;
	let targetRef: string;
	try {
		execFileSync("git", ["rev-parse", `${currentTag}^{}`], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		targetRef = currentTag;
	} catch {
		targetRef = branch || "HEAD";
	}

	// Handle cherry-pick history gap: if the previous tag is NOT a direct
	// ancestor, use merge-base + PR deduplication to avoid double-counting
	// commits already released via cherry-pick.
	let isDirectAncestor = false;
	try {
		execFileSync(
			"git",
			["merge-base", "--is-ancestor", previousTag, targetRef],
			{
				encoding: "utf-8",
			},
		);
		isDirectAncestor = true;
	} catch {
		// Not a direct ancestor
	}

	let log: string;
	const alreadyReleasedPRs = new Set<string>();
	let alreadyPublishedPRs: Set<string> | null = null;

	if (isDirectAncestor) {
		log = execFileSync(
			"git",
			["log", `${previousTag}..${targetRef}`, "--no-merges", "--oneline"],
			{ encoding: "utf-8" },
		);
	} else {
		const mergeBase = execFileSync(
			"git",
			["merge-base", previousTag, targetRef],
			{ encoding: "utf-8" },
		).trim();

		console.log(`  Cherry-pick mode: common ancestor ${mergeBase.slice(0, 7)}`);

		const tagLog = execFileSync(
			"git",
			["log", `${mergeBase}..${previousTag}`, "--oneline"],
			{ encoding: "utf-8" },
		);
		for (const match of tagLog.matchAll(/\(#(\d+)\)/g)) {
			alreadyReleasedPRs.add(match[1]!);
		}
		const previousReleaseBody = fetchReleaseBody(previousTag);
		if (previousReleaseBody !== null) {
			alreadyPublishedPRs = extractReleasePRNumbers(previousReleaseBody);
			console.log(
				`  Previous release body references ${alreadyPublishedPRs.size} PRs`,
			);
		}

		log = execFileSync(
			"git",
			["log", `${mergeBase}..${targetRef}`, "--no-merges", "--oneline"],
			{ encoding: "utf-8" },
		);
	}

	let lines = log.trim().split("\n").filter(Boolean);

	if (alreadyReleasedPRs.size > 0) {
		const before = lines.length;
		lines = lines.filter((line) => {
			const prMatch = line.match(/\(#(\d+)\)/);
			if (!prMatch) return true;
			const prNumber = prMatch[1]!;
			if (!alreadyReleasedPRs.has(prNumber)) return true;
			if (alreadyPublishedPRs) return !alreadyPublishedPRs.has(prNumber);
			return false;
		});
		const filterLabel = alreadyPublishedPRs
			? "already-published"
			: "already-released";
		console.log(`  Filtered ${before - lines.length} ${filterLabel} PRs`);
	}

	// Cancel out revert/original pairs
	const seen = new Map<string, { hash: string; msg: string }>();
	for (const line of lines) {
		const spaceIdx = line.indexOf(" ");
		const hash = line.slice(0, spaceIdx);
		const msg = line.slice(spaceIdx + 1);

		const revertMatch = msg.match(/^Revert "(.+)"$/);
		if (revertMatch) {
			if (seen.has(revertMatch[1]!)) {
				seen.delete(revertMatch[1]!);
			} else {
				seen.set(msg, { hash, msg });
			}
			continue;
		}

		const revertKey = `Revert "${msg}"`;
		if (seen.has(revertKey)) {
			seen.delete(revertKey);
			continue;
		}

		seen.set(msg, { hash, msg });
	}

	// Use the tag ref when it exists to avoid reading newer changesets from
	// a branch that has advanced past the tagged release.
	const changesetRef = targetRef === currentTag ? targetRef : branch;
	const {
		byPR: changesetByPR,
		orphans: changesetOrphans,
		byDescription: changesetByDesc,
	} = buildChangesetIndex(changesetRef);
	if (changesetByPR.size > 0 || changesetOrphans.length > 0) {
		console.log(
			`  Loaded ${changesetByPR.size} changeset descriptions, ${changesetOrphans.length} orphans`,
		);
	}

	const entries: ReleaseEntry[] = [];
	const seenPRs = new Set<number>();
	const consumedOrphans = new Set<ChangesetEntry>();

	for (const { msg } of seen.values()) {
		const parsed = parseConventionalCommit(msg);

		// Direct commits without PRs are infra/version bumps, not user-facing
		const prMatch = msg.match(/\(#(\d+)\)$/);
		if (!prMatch) continue;
		const prNumber = Number(prMatch[1]);

		if (seenPRs.has(prNumber)) continue;

		// A PR with a changeset should appear even if its type is docs:/chore:/etc.
		const descMatch = changesetByDesc.get(parsed.subject.toLowerCase().trim());
		const changeset = changesetByPR.get(prNumber) ?? descMatch;
		if (descMatch) consumedOrphans.add(descMatch);

		if (
			!changeset &&
			["chore", "docs", "ci", "test", "style", "build"].includes(parsed.type)
		) {
			continue;
		}

		seenPRs.add(prNumber);

		let author = "unknown";
		let domain: string;
		let packageName: string;
		let breaking = parsed.breaking;

		const description =
			changeset?.description ?? parsed.subject.replace(/\s*\(#\d+\)$/, "");
		if (changeset?.breaking) breaking = true;

		try {
			const prInfo = fetchPR(prNumber);
			author = prInfo.author;
			domain = classifyEntry(prInfo, parsed.scope || undefined, prInfo.files);
			packageName = resolvePackage(parsed.scope || undefined, prInfo.files);
			if (prInfo.labels.includes("breaking")) breaking = true;
		} catch {
			domain = resolveDomain(parsed.scope || undefined, []);
			packageName = resolvePackage(parsed.scope || undefined, []);
		}

		entries.push({
			id: changeset ? `pr-${prNumber}` : `git-${prNumber}`,
			description,
			prNumber,
			author,
			domain,
			packageName,
			changeType: classifyChangeType(parsed.type, breaking),
			breaking,
		});
	}

	const previousBetaChangesets = loadPreviousPrereleaseChangesets(version);
	const commitHashes = new Set([...seen.values()].map(({ hash }) => hash));

	for (const changeset of changesetOrphans) {
		if (consumedOrphans.has(changeset)) continue;
		if (previousBetaChangesets.has(changeset.id)) continue;

		const commitMatch = changeset.id.match(/^commit-([a-f0-9]+)$/);
		if (
			commitMatch &&
			![...commitHashes].some((h) => h.startsWith(commitMatch[1]!))
		) {
			continue;
		}

		const pkgPaths = changeset.packageNames.map(packageNameToPath);
		const domain = resolveDomain(undefined, pkgPaths);
		if (FILTERED_DOMAINS.has(domain)) continue;

		entries.push({
			id: changeset.id,
			description: changeset.description,
			prNumber: null,
			author: "unknown",
			domain,
			packageName: resolvePackage(undefined, pkgPaths),
			changeType: classifyChangeType("fix", changeset.breaking),
			breaking: changeset.breaking,
		});
	}

	return entries;
}

// ── Formatting ─────────────────────────────────────────────────────────

interface FormatOptions {
	version: string;
	entries: ReleaseEntry[];
	previousTag: string;
	distTag: string;
}

const CHANGE_TYPE_HEADINGS: Record<string, string> = {
	breaking: "### ⚠️ Breaking Changes",
	feat: "### Features",
	fix: "### Bug Fixes",
};

const CHANGE_TYPE_ORDER: ("breaking" | "feat" | "fix")[] = [
	"breaking",
	"feat",
	"fix",
];

function formatReleaseBody(opts: FormatOptions): string {
	const { version, entries, previousTag } = opts;
	const lines: string[] = [];
	const isBeta = version.includes("-");

	// Blog post link for stable releases
	if (!isBeta) {
		const majorMinor = version.match(/^(\d+)\.(\d+)/);
		if (majorMinor) {
			const blogSlug = `${majorMinor[1]}-${majorMinor[2]}`;
			lines.push(
				`**Blog post:** [Better Auth ${majorMinor[1]}.${majorMinor[2]}](https://better-auth.com/blog/${blogSlug})`,
			);
			lines.push("");
		}
	}

	// Group entries by package
	const grouped = new Map<string, ReleaseEntry[]>();
	const contributors = new Set<string>();

	for (const entry of entries) {
		if (FILTERED_DOMAINS.has(entry.domain)) continue;
		const list = grouped.get(entry.packageName) ?? [];
		list.push(entry);
		grouped.set(entry.packageName, list);
		if (entry.author !== "unknown") contributors.add(entry.author);
	}

	// Sort packages: better-auth first, then by breaking count desc,
	// then by total entry count desc, then alphabetically
	const packageOrder = [...grouped.keys()].sort((a, b) => {
		if (a === "better-auth") return -1;
		if (b === "better-auth") return 1;
		const aBreaking = grouped
			.get(a)!
			.filter((e) => e.changeType === "breaking").length;
		const bBreaking = grouped
			.get(b)!
			.filter((e) => e.changeType === "breaking").length;
		if (aBreaking !== bBreaking) return bBreaking - aBreaking;
		const aTotal = grouped.get(a)!.length;
		const bTotal = grouped.get(b)!.length;
		if (aTotal !== bTotal) return bTotal - aTotal;
		return a.localeCompare(b);
	});

	for (const pkg of packageOrder) {
		const pkgEntries = grouped.get(pkg)!;

		lines.push(`## \`${pkg}\``);
		lines.push("");

		// Group by change type within this package
		for (const changeType of CHANGE_TYPE_ORDER) {
			const typeEntries = pkgEntries.filter((e) => e.changeType === changeType);
			if (typeEntries.length === 0) continue;

			typeEntries.sort((a, b) => a.description.localeCompare(b.description));

			lines.push(CHANGE_TYPE_HEADINGS[changeType]!);
			lines.push("");

			for (const entry of typeEntries) {
				const prLink = entry.prNumber
					? ` ([#${entry.prNumber}](https://github.com/${REPO}/pull/${entry.prNumber}))`
					: "";

				if (changeType === "breaking") {
					// Breaking changes get bold description for the AI to expand
					lines.push(`**BREAKING:** ${entry.description}${prLink}`);
				} else {
					lines.push(`- ${entry.description}${prLink}`);
				}
			}
			lines.push("");
		}

		lines.push("---");
		lines.push("");
	}

	// Contributors
	if (contributors.size > 0) {
		lines.push("## Contributors");
		lines.push("");
		lines.push("Thanks to everyone who contributed to this release:");
		lines.push("");
		const sorted = [...contributors].sort((a, b) =>
			a.toLowerCase().localeCompare(b.toLowerCase()),
		);
		lines.push(sorted.map((c) => `@${c}`).join(", "));
		lines.push("");
	}

	const currentTag = `v${version}`;
	lines.push(
		`**Full changelog:** [\`${previousTag}...${currentTag}\`](https://github.com/${REPO}/compare/${previousTag}...${currentTag})`,
	);

	return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────

const { version, branch, distTag, dryRun } = parseArgs();
const isBeta = version.includes("-");
const previousTag = findPreviousTag(version, isBeta);

console.log(`Generating release notes for v${version}`);
console.log(`  Previous tag: ${previousTag}`);
console.log(`  Release type: ${isBeta ? "pre-release" : "stable"}`);
console.log(`  Branch: ${branch || "HEAD"}`);
if (distTag) console.log(`  Dist tag: ${distTag}`);
console.log("");

console.log("Collecting entries...");
const entries = collectEntries(version, branch);
console.log(`  Found ${entries.length} entries`);
console.log("");

const body = formatReleaseBody({
	version,
	entries,
	previousTag,
	distTag,
});

if (dryRun) {
	console.log("=== DRY RUN — Raw changelog ===\n");
	console.log(body);
} else {
	// Write inside the repo directory so claude-code-action can read it
	const rawFile = join(process.cwd(), `.release-notes-raw-${version}.md`);
	writeFileSync(rawFile, body);
	console.log(`Wrote raw changelog to ${rawFile}`);
	setOutput("version", version);
	setOutput("previous_tag", previousTag);
	setOutput("is_beta", String(isBeta));
	setOutput("raw_changelog_path", rawFile);
	setOutput(
		"pr_numbers",
		entries
			.filter((e) => e.prNumber)
			.map((e) => e.prNumber)
			.join(","),
	);
}
