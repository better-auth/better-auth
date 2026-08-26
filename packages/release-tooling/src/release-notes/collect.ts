import { readFileSync } from "node:fs";
import * as semver from "semver";
import * as z from "zod";
import {
	classifyChangeType,
	DOMAIN_ORDER,
	resolveDomain,
	resolvePackage,
} from "../change-classifier.ts";
import { parseConventionalHeader } from "../conventional-header.ts";
import { gitSucceeds, runGit } from "../git.ts";
import type { GitHubReader } from "../github.ts";
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
	return runGit(["show", `${ref}:${path}`]);
}

function readFileFromRef(path: string, branch: string): string {
	if (branch) {
		return gitShow(branch, path);
	}
	return readFileSync(path, "utf-8");
}

function refHasPath(ref: string, path: string): boolean {
	return gitSucceeds(["cat-file", "-e", `${ref}:${path}`]);
}

function listTags(): string[] {
	const output = runGit(["tag", "--sort=-version:refname", "--list", "v*"]);
	return output.trim().split("\n").filter(Boolean);
}

export function findPreviousTag(
	currentVersion: string,
	prerelease: boolean,
	ref = "HEAD",
): string {
	const tags = listTags();
	const current = semver.parse(currentVersion);
	if (!current) throw new Error(`Invalid release version: ${currentVersion}`);

	if (prerelease) {
		for (const tag of tags) {
			const candidate = semver.parse(tag.slice(1));
			if (
				candidate &&
				candidate.prerelease.length > 0 &&
				candidate.major === current.major &&
				candidate.minor === current.minor &&
				candidate.patch === current.patch &&
				semver.lt(candidate, current) &&
				gitSucceeds(["merge-base", "--is-ancestor", tag, ref])
			) {
				return tag;
			}
		}

		for (const tag of tags) {
			const candidate = semver.parse(tag.slice(1));
			if (
				candidate &&
				candidate.prerelease.length === 0 &&
				semver.lt(candidate, current) &&
				gitSucceeds(["merge-base", "--is-ancestor", tag, ref])
			) {
				return tag;
			}
		}
	}

	const currentTag = `v${currentVersion}`;
	let fallback: string | undefined;
	for (const tag of tags) {
		if (tag === currentTag) continue;
		const candidate = semver.parse(tag.slice(1));
		if (
			!candidate ||
			candidate.prerelease.length > 0 ||
			!semver.lt(candidate, current)
		) {
			continue;
		}
		if (
			candidate.major === current.major &&
			candidate.minor === current.minor
		) {
			return tag;
		}
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

const prCache = new Map<number, PRInfo | null>();
const releaseBodyCache = new Map<string, string | null>();

async function fetchPR(
	github: GitHubReader | undefined,
	prNumber: number,
): Promise<PRInfo | null> {
	if (prCache.has(prNumber)) return prCache.get(prNumber) ?? null;

	const data = github ? await github.getPullRequest(prNumber) : null;
	if (!data) {
		prCache.set(prNumber, null);
		return null;
	}

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
	github: GitHubReader | undefined,
	tag: string,
): Promise<string | null> {
	const cached = releaseBodyCache.get(tag);
	if (cached !== undefined) return cached;

	const body = github ? await github.getReleaseBody(tag) : null;
	if (body === null) {
		releaseBodyCache.set(tag, null);
		return null;
	}

	releaseBodyCache.set(tag, body);
	return body;
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
			if (DOMAIN_ORDER.some((domain) => domain === label)) {
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
	const subject = runGit([
		"log",
		"--diff-filter=A",
		"--format=%s",
		"-n",
		"1",
		ref,
		"--",
		`.changeset/${id}.md`,
	]).trim();
	const prMatch = subject.match(/\(#(\d+)\)$/);
	return prMatch ? Number(prMatch[1]) : null;
}

const ignoredChangesetFiles = new Set(["README", "config"]);
const changesetIdPattern = /^[A-Za-z0-9_-]+$/;

function isChangesetId(value: string): boolean {
	return !ignoredChangesetFiles.has(value) && changesetIdPattern.test(value);
}

function changesetIdsFromPaths(paths: string): string[] {
	return paths
		.split("\n")
		.map((file) => file.trim())
		.filter(Boolean)
		.map((file) => file.replace(/^\.changeset\//, "").replace(/\.md$/, ""))
		.filter(isChangesetId);
}

export function findPendingChangesets(ref: string): string[] {
	const files = runGit(["ls-tree", "-r", "--name-only", ref, ".changeset/"]);
	const changesets = changesetIdsFromPaths(files).sort();
	if (!refHasPath(ref, ".changeset/pre.json")) return changesets;

	const prerelease = parseSchema(
		prereleaseStateSchema,
		JSON.parse(gitShow(ref, ".changeset/pre.json")),
		`Invalid changeset pre-release state at ${ref}`,
	);
	const consumed = new Set(prerelease.changesets);
	return changesets.filter((changeset) => !consumed.has(changeset));
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
	const deletedFiles = runGit([
		"diff",
		"--diff-filter=D",
		"--name-only",
		parentRef,
		commitRef,
		"--",
		".changeset/",
	]);
	const ids = changesetIdsFromPaths(deletedFiles);
	return ids.length > 0 ? { ids, ref: parentRef } : null;
}

function listCommits(range: string, path: string): string[] {
	return runGit(["rev-list", range, "--", path])
		.trim()
		.split("\n")
		.filter(Boolean);
}

function commitParents(commit: string): string[] {
	const [, ...parents] = runGit(["rev-list", "--parents", "-n", "1", commit])
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

export function findUnreleasedVersionCommit(
	version: string,
	ref: string,
): string | null {
	if (gitSucceeds(["rev-parse", "--verify", `v${version}^{commit}`])) {
		return null;
	}
	const previousTag = findPreviousTag(version, version.includes("-"), ref);
	return findVersionCommit(ref, previousTag, version);
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
	const files = runGit(["ls-tree", "-r", "--name-only", ref, ".changeset/"]);
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
		for (const id of preJSON.changesets.filter(isChangesetId)) ids.add(id);
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
 * a direct ancestor) using PR-number deduplication.
 */
export async function collectEntries(
	github: GitHubReader | undefined,
	version: string,
	branch: string,
	releaseRef?: string,
): Promise<ReleaseEntry[]> {
	const currentTag = `v${version}`;
	let targetRef: string;
	if (releaseRef) {
		targetRef = releaseRef;
	} else {
		if (gitSucceeds(["rev-parse", `${currentTag}^{}`])) {
			targetRef = currentTag;
		} else {
			targetRef = branch || "HEAD";
		}
	}
	const previousTag = findPreviousTag(
		version,
		version.includes("-"),
		targetRef,
	);

	// Handle cherry-pick history gap: if the previous tag is NOT a direct
	// ancestor, use merge-base + PR deduplication to avoid double-counting
	// commits already released via cherry-pick.
	const isDirectAncestor = gitSucceeds([
		"merge-base",
		"--is-ancestor",
		previousTag,
		targetRef,
	]);

	let log: string;
	const alreadyReleasedPRs = new Set<string>();
	let alreadyPublishedPRs: Set<string> | null = null;

	if (isDirectAncestor) {
		log = runGit([
			"log",
			`${previousTag}..${targetRef}`,
			"--no-merges",
			"--format=%H %s",
		]);
	} else {
		const mergeBase = runGit(["merge-base", previousTag, targetRef]).trim();

		console.log(`  Cherry-pick mode: common ancestor ${mergeBase.slice(0, 7)}`);

		const tagLog = runGit(["log", `${mergeBase}..${previousTag}`, "--oneline"]);
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

		log = runGit([
			"log",
			`${mergeBase}..${targetRef}`,
			"--no-merges",
			"--format=%H %s",
		]);
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
		const subject = parsed.subject.replace(/\s*\(#\d+\)$/, "").trim();
		const descMatch = changesetByDesc.get(subject.toLowerCase());
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

		title = subject;
		domain = resolveDomain(parsed.scope || undefined, []);
		packageName =
			changeset?.packageNames.length === 1
				? changeset.packageNames[0]!
				: resolvePackage(parsed.scope || undefined, []);

		const prInfo = await fetchPR(github, prNumber);
		if (prInfo) {
			author = prInfo.author;
			title = prInfo.title;
			domain = classifyEntry(prInfo, parsed.scope || undefined, prInfo.files);
			packageName =
				changeset?.packageNames.length === 1
					? changeset.packageNames[0]!
					: resolvePackage(parsed.scope || undefined, prInfo.files);
			if (prInfo.labels.includes("breaking")) breaking = true;
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
