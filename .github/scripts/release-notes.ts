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
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ghJSON, REPO, setOutput } from "./lib/github.ts";
import {
	DOMAIN_ORDER,
	FILTERED_DOMAINS,
	parseConventionalCommit,
	resolveDomain,
} from "./lib/pr-analyzer.ts";

// ── Types ──────────────────────────────────────────────────────────────

interface ReleaseEntry {
	id: string;
	description: string;
	prNumber: number | null;
	author: string;
	domain: string;
	breaking: boolean;
}

interface PRInfo {
	author: string;
	title: string;
	labels: string[];
	files: string[];
}

// ── Constants ──────────────────────────────────────────────────────────

const DOMAIN_DISPLAY_NAMES: Record<string, string> = {
	core: "Core",
	database: "Database",
	oauth: "OAuth",
	credentials: "Credentials",
	identity: "Identity",
	organization: "Organization",
	security: "Security",
	enterprise: "Enterprise",
	payments: "Payments",
	platform: "Platform",
	devtools: "Devtools",
};

// Package name → directory mapping for packages that don't follow
// the @better-auth/<dir> convention.
const PACKAGE_DIR_OVERRIDES: Record<string, string> = {
	auth: "cli",
	"better-auth": "better-auth",
};

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
	const base = ver.replace(/-.*$/, ""); // strip pre-release suffix
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
		const betaMatch = currentVersion.match(/^(.+)-(?:beta|alpha|rc)\.(\d+)$/);
		if (betaMatch && Number(betaMatch[2]) > 0) {
			const prevN = Number(betaMatch[2]) - 1;
			const prevVersion = `${betaMatch[1]}-beta.${prevN}`;
			const prevTag = `v${prevVersion}`;
			if (tags.includes(prevTag)) return prevTag;
		}
	}

	const currentTag = `v${currentVersion}`;

	// Extract the major.minor prefix to scope to the current release line.
	const majorMinorMatch = currentVersion.match(/^(\d+\.\d+)\./);
	const majorMinor = majorMinorMatch?.[1];

	for (const tag of tags) {
		if (tag === currentTag) continue;
		const ver = tag.replace(/^v/, "");
		if (ver.includes("-")) continue;
		if (majorMinor && !ver.startsWith(`${majorMinor}.`)) continue;
		// Only return tags strictly older than the current version
		if (!isOlderVersion(ver, currentVersion)) continue;
		return tag;
	}

	// Fallback: any stable tag older than the current version
	for (const tag of tags) {
		if (tag === currentTag) continue;
		const ver = tag.replace(/^v/, "");
		if (ver.includes("-")) continue;
		if (!isOlderVersion(ver, currentVersion)) continue;
		return tag;
	}

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
	description: string;
	breaking: boolean;
	packageNames: string[];
}

/**
 * Build a map of PR number → changeset description by scanning .changeset/ for
 * pr-*.md and commit-*.md files directly. Does not rely on pre.json.changesets
 * which can be empty on freshly entered pre-release branches or absent on main.
 */
function buildChangesetIndex(branch: string): {
	byPR: Map<number, ChangesetEntry>;
	orphans: ChangesetEntry[];
} {
	const byPR = new Map<number, ChangesetEntry>();
	const orphans: ChangesetEntry[] = [];

	// Collect changeset IDs from two sources:
	// 1. pre.json.changesets (consumed changesets, always present in pre-release mode)
	// 2. Directory listing (uncovered changesets not yet versioned)
	const ids = new Set<string>();

	try {
		const raw = readFileFromRef(".changeset/pre.json", branch);
		const preJSON = JSON.parse(raw) as { changesets: string[] };
		for (const id of preJSON.changesets) ids.add(id);
	} catch {
		// No pre.json — that's fine, we'll scan the directory
	}

	// Scan .changeset/ for pr-* and commit-* files. Try the target ref first;
	// Search for a commit that still has changeset files.
	// On main after promotion, `changeset version` deletes them. The files
	// may be on: (1) an ancestor on the first-parent chain, or (2) the
	// merged next branch side (HEAD^2) from the promote merge commit.
	const baseRef = branch || "HEAD";
	let effectiveBranch = branch;
	const refsToTry = [baseRef];
	for (let i = 1; i <= 5; i++) refsToTry.push(`${baseRef}~${i}`);
	// Also check the second parent of merge commits (promote flow: next → main)
	for (let i = 0; i <= 3; i++) {
		const mergeRef = i === 0 ? baseRef : `${baseRef}~${i}`;
		refsToTry.push(`${mergeRef}^2`);
	}
	for (const ref of refsToTry) {
		try {
			const listing = execFileSync(
				"git",
				["ls-tree", "-r", "--name-only", ref, ".changeset/"],
				{ encoding: "utf-8" },
			);
			const SKIP_FILES = new Set(["README", "config"]);
			let foundAny = false;
			for (const file of listing.split("\n")) {
				const name = file.replace(/^\.changeset\//, "").replace(/\.md$/, "");
				if (!name || SKIP_FILES.has(name) || !file.endsWith(".md")) continue;
				ids.add(name);
				foundAny = true;
			}
			if (foundAny) {
				effectiveBranch = ref;
				break;
			}
		} catch {
			// ref doesn't exist or listing failed — try next
		}
	}

	for (const id of ids) {
		try {
			const content = readFileFromRef(`.changeset/${id}.md`, effectiveBranch);
			const { packages, description } = parseChangesetFile(content);
			if (!description) continue;

			const breaking = Object.values(packages).some((b) => b === "major");
			const entry: ChangesetEntry = {
				description,
				breaking,
				packageNames: Object.keys(packages),
			};

			const prMatch = id.match(/^pr-(\d+)$/);
			if (prMatch) {
				byPR.set(Number(prMatch[1]), entry);
			} else {
				orphans.push(entry);
			}
		} catch {
			// File not found — skip
		}
	}

	return { byPR, orphans };
}

/** Map a changeset package name to its directory under packages/ */
function packageNameToPath(name: string): string {
	const stripped = name.replace(/^@better-auth\//, "");
	const dir = PACKAGE_DIR_OVERRIDES[stripped] ?? stripped;
	return `packages/${dir}/`;
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
function collectEntries(
	version: string,
	branch: string,
): { entries: ReleaseEntry[]; targetRef: string } {
	const previousTag = findPreviousTag(version, version.includes("-"));

	// Determine the target ref: tag > branch arg > HEAD
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
		// Not a direct ancestor — cherry-pick model
	}

	let log: string;
	const alreadyReleasedPRs = new Set<string>();

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

		// Collect PR numbers between merge-base and the previous tag
		// (scoped range avoids reading the entire tag history)
		const tagLog = execFileSync(
			"git",
			["log", `${mergeBase}..${previousTag}`, "--oneline"],
			{ encoding: "utf-8" },
		);
		for (const match of tagLog.matchAll(/\(#(\d+)\)/g)) {
			alreadyReleasedPRs.add(match[1]!);
		}

		log = execFileSync(
			"git",
			["log", `${mergeBase}..${targetRef}`, "--no-merges", "--oneline"],
			{ encoding: "utf-8" },
		);
	}

	let lines = log.trim().split("\n").filter(Boolean);

	// In cherry-pick mode, filter out commits whose PR was already released
	if (alreadyReleasedPRs.size > 0) {
		const before = lines.length;
		lines = lines.filter((line) => {
			const prMatch = line.match(/\(#(\d+)\)/);
			if (!prMatch) return true;
			return !alreadyReleasedPRs.has(prMatch[1]!);
		});
		console.log(`  Filtered ${before - lines.length} already-released PRs`);
	}

	// Revert chain cancellation
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

	// Build changeset index for description enrichment
	const { byPR: changesetByPR, orphans: changesetOrphans } =
		buildChangesetIndex(branch);
	if (changesetByPR.size > 0 || changesetOrphans.length > 0) {
		console.log(
			`  Loaded ${changesetByPR.size} changeset descriptions, ${changesetOrphans.length} orphans`,
		);
	}

	const entries: ReleaseEntry[] = [];
	const seenPRs = new Set<number>();

	for (const { msg } of seen.values()) {
		const parsed = parseConventionalCommit(msg);

		// Only include commits with a PR number — direct commits without PRs
		// are infra changes, version bumps, or blog edits that aren't user-facing.
		const prMatch = msg.match(/\(#(\d+)\)$/);
		if (!prMatch) continue;
		const prNumber = Number(prMatch[1]);

		if (seenPRs.has(prNumber)) continue;

		// Check for a changeset BEFORE filtering by commit type — a PR with
		// a manual changeset should appear in release notes even if its
		// merge title starts with docs:/chore:/etc.
		const changeset = changesetByPR.get(prNumber);

		if (
			!changeset &&
			["chore", "docs", "ci", "test", "style", "build"].includes(parsed.type)
		) {
			continue;
		}

		seenPRs.add(prNumber);

		let author = "unknown";
		let domain: string;
		let breaking = parsed.breaking;

		const description =
			changeset?.description ?? parsed.subject.replace(/\s*\(#\d+\)$/, "");
		if (changeset?.breaking) breaking = true;

		try {
			const prInfo = fetchPR(prNumber);
			author = prInfo.author;
			domain = classifyEntry(prInfo, parsed.scope || undefined, prInfo.files);
			if (prInfo.labels.includes("breaking")) breaking = true;
		} catch {
			domain = resolveDomain(parsed.scope || undefined, []);
		}

		entries.push({
			id: changeset ? `pr-${prNumber}` : `git-${prNumber}`,
			description,
			prNumber,
			author,
			domain,
			breaking,
		});
	}

	// Add orphan changesets (commit-HASH pattern, no PR)
	for (const changeset of changesetOrphans) {
		const pkgPaths = changeset.packageNames.map(packageNameToPath);
		const domain = resolveDomain(undefined, pkgPaths);
		if (FILTERED_DOMAINS.has(domain)) continue;

		entries.push({
			id: `changeset-orphan`,
			description: changeset.description,
			prNumber: null,
			author: "unknown",
			domain,
			breaking: changeset.breaking,
		});
	}

	return { entries, targetRef };
}

// ── Formatting ─────────────────────────────────────────────────────────

function formatReleaseBody(
	version: string,
	isBeta: boolean,
	entries: ReleaseEntry[],
	previousTag: string,
	distTag: string,
	targetRef: string,
	dryRun: boolean,
): string {
	const lines: string[] = [];

	// Determine the install tag: explicit dist-tag > infer from version
	const installTag = distTag || (isBeta ? "beta" : "latest");
	lines.push(`> Install: \`npm i better-auth@${installTag}\``);
	lines.push("");

	const grouped = new Map<string, ReleaseEntry[]>();
	for (const entry of entries) {
		if (FILTERED_DOMAINS.has(entry.domain)) continue;
		const list = grouped.get(entry.domain) ?? [];
		list.push(entry);
		grouped.set(entry.domain, list);
	}

	for (const domain of DOMAIN_ORDER) {
		const domainEntries = grouped.get(domain);
		if (!domainEntries?.length) continue;

		const displayName = DOMAIN_DISPLAY_NAMES[domain] ?? domain;
		lines.push(`## ${displayName}`);
		lines.push("");

		domainEntries.sort((a, b) => {
			if (a.breaking !== b.breaking) return a.breaking ? -1 : 1;
			return a.description.localeCompare(b.description);
		});

		for (const entry of domainEntries) {
			const prefix = entry.breaking ? "**BREAKING:** " : "";
			const prLink = entry.prNumber
				? ` ([#${entry.prNumber}](https://github.com/${REPO}/pull/${entry.prNumber}))`
				: "";
			const authorAttr =
				entry.author !== "unknown" ? ` by @${entry.author}` : "";
			lines.push(`- ${prefix}${entry.description}${prLink}${authorAttr}`);
		}
		lines.push("");
	}

	// In CI (non-dry-run), the tag will be created after these notes are
	// generated, so always use v<version> for a stable compare link.
	// In preview/dry-run mode, use the branch ref since the tag doesn't exist.
	const currentTag = `v${version}`;
	const compareTarget =
		targetRef === currentTag || !dryRun
			? currentTag
			: targetRef.replace(/^origin\//, "");
	lines.push(
		`**Full changelog**: [\`${previousTag}...${compareTarget}\`](https://github.com/${REPO}/compare/${previousTag}...${compareTarget})`,
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
const { entries, targetRef } = collectEntries(version, branch);
console.log(`  Found ${entries.length} entries`);
console.log("");

const body = formatReleaseBody(
	version,
	isBeta,
	entries,
	previousTag,
	distTag,
	targetRef,
	dryRun,
);

if (dryRun) {
	console.log("=== DRY RUN — Raw changelog ===\n");
	console.log(body);
} else {
	// Write raw changelog to temp file for the AI stage
	// Write inside the repo working directory so claude-code-action can read it
	// (it restricts file access to the checkout directory)
	const rawFile = join(process.cwd(), `.release-notes-raw-${version}.md`);
	writeFileSync(rawFile, body);
	console.log(`Wrote raw changelog to ${rawFile}`);

	// Set outputs for the workflow
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
