import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as z from "zod";
import {
	classifyChangeType,
	DOMAIN_ORDER,
	resolveDomain,
	resolvePackage,
} from "../change-classifier.ts";
import { parseConventionalHeader } from "../conventional-header.ts";
import type { GitHubReader } from "../github-reader.ts";
import type { PackageReleaseMetadata, ReleaseEntry } from "./schema.ts";
import { parseSchema, prereleaseStateSchema } from "./schema.ts";

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

const packageVersionSchema = z.object({ version: z.string() });

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

function refHasPath(ref: string, path: string): boolean {
	try {
		execFileSync("git", ["cat-file", "-e", `${ref}:${path}`], {
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

function listTags(): string[] {
	const output = execFileSync(
		"git",
		["tag", "--sort=-version:refname", "--list", "v*"],
		{ encoding: "utf-8" },
	);
	return output.trim().split("\n").filter(Boolean);
}

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

export function findPreviousTag(
	currentVersion: string,
	isBeta: boolean,
): string {
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

const prCache = new Map<number, PRInfo>();
const releaseBodyCache = new Map<string, string | null>();

async function fetchPR(
	github: GitHubReader,
	prNumber: number,
): Promise<PRInfo> {
	const cached = prCache.get(prNumber);
	if (cached) return cached;

	const data = await github.getPullRequest(prNumber);

	const info: PRInfo = {
		author: data.author,
		title: data.title,
		labels: data.labels,
		files: data.changedFiles,
	};

	prCache.set(prNumber, info);
	return info;
}

async function fetchReleaseBody(
	github: GitHubReader,
	tag: string,
): Promise<string | null> {
	const cached = releaseBodyCache.get(tag);
	if (cached !== undefined) return cached;

	try {
		const body = await github.getReleaseBody(tag);
		if (body === null) {
			releaseBodyCache.set(tag, null);
			return null;
		}

		releaseBodyCache.set(tag, body);
		return body;
	} catch (error) {
		if (process.env.GITHUB_ACTIONS === "true") throw error;
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

interface ChangesetEntry {
	id: string;
	description: string;
	breaking: boolean;
	packageNames: string[];
}

function findChangesetSourcePR(id: string, ref: string): number | null {
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
}

const ignoredChangesetFiles = new Set(["README", "config"]);

function changesetIdsFromPaths(paths: string): string[] {
	return paths
		.split("\n")
		.map((file) => file.trim())
		.filter(Boolean)
		.map((file) => file.replace(/^\.changeset\//, "").replace(/\.md$/, ""))
		.filter(
			(name) => !ignoredChangesetFiles.has(name) && /^[a-z0-9-]+$/.test(name),
		);
}

function readPackageVersion(ref: string): string | null {
	if (!refHasPath(ref, "packages/better-auth/package.json")) return null;
	const result = packageVersionSchema.safeParse(
		JSON.parse(gitShow(ref, "packages/better-auth/package.json")),
	);
	return result.success ? result.data.version : null;
}

function findDeletedChangesets(
	parentRef: string,
	commitRef: string,
): ChangesetSnapshot | null {
	const deletedFiles = execFileSync(
		"git",
		[
			"diff",
			"--diff-filter=D",
			"--name-only",
			parentRef,
			commitRef,
			"--",
			".changeset/",
		],
		{ encoding: "utf-8" },
	);
	const ids = changesetIdsFromPaths(deletedFiles);
	return ids.length > 0 ? { ids, ref: parentRef } : null;
}

function listCommits(range: string, path: string): string[] {
	return execFileSync("git", ["rev-list", range, "--", path], {
		encoding: "utf-8",
	})
		.trim()
		.split("\n")
		.filter(Boolean);
}

function commitParents(commit: string): string[] {
	const [, ...parents] = execFileSync(
		"git",
		["rev-list", "--parents", "-n", "1", commit],
		{ encoding: "utf-8" },
	)
		.trim()
		.split(" ");
	return parents;
}

function findVersionCommit(
	ref: string,
	previousTag: string,
	version: string,
): string | null {
	for (const commit of listCommits(
		`${previousTag}..${ref}`,
		"packages/better-auth/package.json",
	)) {
		if (readPackageVersion(commit) !== version) continue;
		const parents = commitParents(commit);
		if (!parents.some((parent) => readPackageVersion(parent) !== version)) {
			continue;
		}
		return commit;
	}
	return null;
}

function findConsumedChangesets(
	ref: string,
	previousTag: string,
	version: string,
): ChangesetSnapshot | null {
	const versionCommit = findVersionCommit(ref, previousTag, version);
	if (!versionCommit) return null;

	for (const commit of listCommits(
		`${previousTag}..${versionCommit}`,
		".changeset/",
	)) {
		for (const parent of commitParents(commit)) {
			const snapshot = findDeletedChangesets(parent, commit);
			if (snapshot) return snapshot;
		}
	}

	return null;
}

function findCurrentChangesets(ref: string): ChangesetSnapshot | null {
	const files = execFileSync(
		"git",
		["ls-tree", "-r", "--name-only", ref, ".changeset/"],
		{ encoding: "utf-8" },
	);
	const ids = changesetIdsFromPaths(files);
	return ids.length > 0 ? { ids, ref } : null;
}

/** Build a map of PR number to changeset description from .changeset/ files and pre.json. */
function buildChangesetIndex(
	ref: string,
	previousTag: string,
	version: string,
): {
	byPR: Map<number, ChangesetEntry>;
	orphans: ChangesetEntry[];
	byDescription: Map<string, ChangesetEntry>;
} {
	const byPR = new Map<number, ChangesetEntry>();
	const orphans: ChangesetEntry[] = [];
	const byDescription = new Map<string, ChangesetEntry>();

	const ids = new Set<string>();
	const baseRef = ref || "HEAD";
	let effectiveRef = baseRef;

	const hasPreJSON = refHasPath(baseRef, ".changeset/pre.json");
	if (hasPreJSON) {
		const raw = readFileFromRef(".changeset/pre.json", baseRef);
		const preJSON = parseSchema(
			prereleaseStateSchema,
			JSON.parse(raw),
			`Invalid changeset pre-release state at ${baseRef}`,
		);
		for (const id of preJSON.changesets) ids.add(id);
	}

	if (!hasPreJSON) {
		const snapshot =
			findConsumedChangesets(baseRef, previousTag, version) ??
			findCurrentChangesets(baseRef);
		if (snapshot) {
			effectiveRef = snapshot.ref;
			for (const id of snapshot.ids) ids.add(id);
		}
	}

	for (const id of ids) {
		const content = readFileFromRef(`.changeset/${id}.md`, effectiveRef);
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
			const sourcePrNumber = findChangesetSourcePR(id, effectiveRef);
			if (sourcePrNumber && !byPR.has(sourcePrNumber)) {
				byPR.set(sourcePrNumber, entry);
			} else {
				orphans.push(entry);
				const firstLine = description.split("\n")[0]!.trim().toLowerCase();
				if (firstLine) byDescription.set(firstLine, entry);
			}
		}
	}

	return { byPR, orphans, byDescription };
}

function packageToDir(name: string): string {
	if (name === "auth") return "packages/cli";
	if (name === "better-auth") return "packages/better-auth";
	return `packages/${name.replace(/^@better-auth\//, "")}`;
}

function packageToReadmeUrl(
	repository: string,
	name: string,
	ref: string,
): string {
	return `https://github.com/${repository}/blob/${ref}/${packageToDir(name)}/README.md`;
}

function packageToChangelogUrl(
	repository: string,
	name: string,
	ref: string,
): string {
	return `https://github.com/${repository}/blob/${ref}/${packageToDir(name)}/CHANGELOG.md`;
}

function isNewPackageSinceTag(name: string, previousTag: string): boolean {
	return !refHasPath(previousTag, `${packageToDir(name)}/package.json`);
}

function packageReferenceLink(
	repository: string,
	name: string,
	ref: string,
): { label: "CHANGELOG" | "README"; url: string } {
	if (refHasPath(ref, `${packageToDir(name)}/CHANGELOG.md`)) {
		return {
			label: "CHANGELOG",
			url: packageToChangelogUrl(repository, name, ref),
		};
	}

	return {
		label: "README",
		url: packageToReadmeUrl(repository, name, ref),
	};
}

export function buildPackageMetadata(
	repository: string,
	entries: ReleaseEntry[],
	previousTag: string,
	commitRef: string,
): Record<string, PackageReleaseMetadata> {
	const metadata: Record<string, PackageReleaseMetadata> = {};
	for (const packageName of new Set(
		entries.map((entry) => entry.packageName),
	)) {
		const reference = packageReferenceLink(repository, packageName, commitRef);
		metadata[packageName] = {
			newPackage: isNewPackageSinceTag(packageName, previousTag),
			referenceLabel: reference.label,
			referenceUrl: reference.url,
		};
	}
	return metadata;
}

/** Load changeset IDs from the previous beta's pre.json to exclude from orphans. */
function loadPreviousPrereleaseChangesets(version: string): Set<string> {
	const preMatch = version.match(/^(.+)-(beta|alpha|rc)\.(\d+)$/);
	if (!preMatch || Number(preMatch[3]) === 0) return new Set();

	const channel = preMatch[2];
	const prevTag = `v${preMatch[1]}-${channel}.${Number(preMatch[3]) - 1}`;
	if (!refHasPath(prevTag, ".changeset/pre.json")) {
		return new Set();
	}

	const prevPre = parseSchema(
		prereleaseStateSchema,
		JSON.parse(gitShow(prevTag, ".changeset/pre.json")),
		`Invalid changeset pre-release state at ${prevTag}`,
	);
	return new Set(prevPre.changesets);
}

/**
 * Collects release entries using git history as the ground truth,
 * enriched with changeset descriptions where available.
 *
 * Handles the cherry-pick history gap (where the previous tag is not
 * a direct ancestor) using PR-number deduplication, same as
 * release-previews.sh.
 */
export async function collectEntries(
	github: GitHubReader,
	version: string,
	branch: string,
	releaseRef?: string,
): Promise<ReleaseEntry[]> {
	const previousTag = findPreviousTag(version, version.includes("-"));

	const currentTag = `v${version}`;
	let targetRef: string;
	if (releaseRef) {
		targetRef = releaseRef;
	} else {
		try {
			execFileSync("git", ["rev-parse", `${currentTag}^{}`], {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			});
			targetRef = currentTag;
		} catch {
			targetRef = branch || "HEAD";
		}
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
			["log", `${previousTag}..${targetRef}`, "--no-merges", "--format=%H %s"],
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
		const previousReleaseBody = await fetchReleaseBody(github, previousTag);
		if (previousReleaseBody !== null) {
			alreadyPublishedPRs = extractReleasePRNumbers(previousReleaseBody);
			console.log(
				`  Previous release body references ${alreadyPublishedPRs.size} PRs`,
			);
		}

		log = execFileSync(
			"git",
			["log", `${mergeBase}..${targetRef}`, "--no-merges", "--format=%H %s"],
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
	const changesetRef =
		releaseRef ?? (targetRef === currentTag ? targetRef : branch);
	const {
		byPR: changesetByPR,
		orphans: changesetOrphans,
		byDescription: changesetByDesc,
	} = buildChangesetIndex(changesetRef, previousTag, version);
	if (changesetByPR.size > 0 || changesetOrphans.length > 0) {
		console.log(
			`  Loaded ${changesetByPR.size} changeset descriptions, ${changesetOrphans.length} orphans`,
		);
	}

	const entries: ReleaseEntry[] = [];
	const seenPRs = new Set<number>();
	const consumedOrphans = new Set<ChangesetEntry>();

	for (const { msg } of seen.values()) {
		const parsed = parseConventionalHeader(msg);

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
		let title: string;
		let domain: string;
		let packageName: string;
		let breaking = parsed.breaking;

		const changesetDescription = changeset?.description ?? null;
		if (changeset?.breaking) breaking = true;

		try {
			const prInfo = await fetchPR(github, prNumber);
			author = prInfo.author;
			title = prInfo.title;
			domain = classifyEntry(prInfo, parsed.scope || undefined, prInfo.files);
			packageName =
				changeset?.packageNames.length === 1
					? changeset.packageNames[0]!
					: resolvePackage(parsed.scope || undefined, prInfo.files);
			if (prInfo.labels.includes("breaking")) breaking = true;
		} catch (error) {
			if (process.env.GITHUB_ACTIONS === "true") throw error;
			title = parsed.subject.replace(/\s*\(#\d+\)$/, "");
			domain = resolveDomain(parsed.scope || undefined, []);
			packageName =
				changeset?.packageNames.length === 1
					? changeset.packageNames[0]!
					: resolvePackage(parsed.scope || undefined, []);
		}

		const releasePackages =
			changeset?.packageNames.length && changeset.packageNames.length > 0
				? [...new Set(changeset.packageNames)]
				: [packageName];

		for (const releasePackage of releasePackages) {
			entries.push({
				id: `${changeset ? `pr-${prNumber}` : `git-${prNumber}`}:${releasePackage}`,
				rewriteKey: `pr-${prNumber}`,
				title,
				changesetDescription,
				prNumber,
				author,
				domain,
				packageName: releasePackage,
				changeType: classifyChangeType(parsed.type, breaking),
				breaking,
			});
		}
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

		const pkgPaths = changeset.packageNames.map((n) => `${packageToDir(n)}/`);
		const domain = resolveDomain(undefined, pkgPaths);
		const releasePackages =
			changeset.packageNames.length > 0
				? [...new Set(changeset.packageNames)]
				: [resolvePackage(undefined, pkgPaths)];

		for (const releasePackage of releasePackages) {
			entries.push({
				id: `${changeset.id}:${releasePackage}`,
				rewriteKey: changeset.id,
				title: changeset.description.split("\n")[0]!,
				changesetDescription: changeset.description,
				prNumber: null,
				author: "unknown",
				domain,
				packageName: releasePackage,
				changeType: classifyChangeType("fix", changeset.breaking),
				breaking: changeset.breaking,
			});
		}
	}

	return entries;
}
