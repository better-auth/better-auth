import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setOutput } from "../actions-output.ts";
import type { GitHubReader } from "../github-reader.ts";
import {
	buildPackageMetadata,
	collectEntries,
	findPreviousTag,
	findUnreleasedVersionCommit,
} from "./collect.ts";
import {
	applyReleaseRewrites,
	formatReleaseBody,
	isReleaseEntryVisible,
} from "./render.ts";
import { rewriteReleaseNotes } from "./rewrite.ts";
import type { ReleaseEntry, ReleaseRewriteContext } from "./schema.ts";
import { parseSchema, releaseManifestSchema } from "./schema.ts";

export type ReleaseNotesOperation =
	| { type: "validate" }
	| { type: "candidate"; version: string; branch: string }
	| {
			type: "render";
			manifestPath: string;
			rewritesPath: string;
			outputPath: string;
	  }
	| { type: "rewrite"; contextPath: string; outputPath: string }
	| {
			type: "collect";
			version: string;
			branch: string;
			dryRun: boolean;
			commitRef: string;
	  };

function buildRewriteContext(entries: ReleaseEntry[]): ReleaseRewriteContext {
	const context: ReleaseRewriteContext = {};
	for (const entry of entries) {
		const existing = context[entry.rewriteKey];
		if (existing) {
			if (!existing.packageNames.includes(entry.packageName)) {
				existing.packageNames.push(entry.packageName);
			}
			continue;
		}

		context[entry.rewriteKey] = {
			title: entry.title,
			changesetDescription: entry.changesetDescription,
			prNumber: entry.prNumber,
			packageNames: [entry.packageName],
			changeType: entry.changeType,
		};
	}
	return context;
}

async function collectReleaseNotes(
	github: GitHubReader,
	version: string,
	branch: string,
	dryRun: boolean,
	commitRefOverride: string,
): Promise<void> {
	const isBeta = version.includes("-");
	const previousTag = findPreviousTag(version, isBeta);
	const commitRef =
		commitRefOverride ||
		process.env.GITHUB_SHA ||
		execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf-8",
		}).trim();

	console.log(`Generating release notes for v${version}`);
	console.log(`  Previous tag: ${previousTag}`);
	console.log(`  Release type: ${isBeta ? "pre-release" : "stable"}`);
	console.log(`  Branch: ${branch || "HEAD"}`);
	console.log(`  Commit: ${commitRef.slice(0, 12)}`);
	console.log("");

	console.log("Collecting entries...");
	const entries = (
		await collectEntries(github, version, branch, commitRef)
	).filter(isReleaseEntryVisible);
	console.log(`  Found ${entries.length} entries`);
	console.log("");

	const manifest = parseSchema(
		releaseManifestSchema,
		{
			repository: github.repository.slug,
			version,
			commitRef,
			entries,
			previousTag,
			packageMetadata: buildPackageMetadata(
				github.repository.slug,
				entries,
				previousTag,
				commitRef,
			),
		},
		"Release manifest must contain at least one valid entry",
	);
	const body = formatReleaseBody(manifest);
	const rewriteContext = buildRewriteContext(entries);

	if (dryRun) {
		console.log("=== DRY RUN — Raw changelog ===\n");
		console.log(body);
		console.log("\n=== Rewrite context (for AI) ===\n");
		console.log(JSON.stringify(rewriteContext, null, 2));
		return;
	}

	const rawFile = `.release-notes-raw-${version}.md`;
	const manifestFile = `.release-notes-manifest-${version}.json`;
	const contextFile = `.release-notes-context-${version}.json`;
	writeFileSync(rawFile, body);
	writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
	writeFileSync(contextFile, JSON.stringify(rewriteContext, null, 2));
	console.log(`Wrote raw changelog to ${rawFile}`);
	console.log(`Wrote release manifest to ${manifestFile}`);
	console.log(`Wrote AI rewrite context to ${contextFile}`);

	setOutput("version", version);
	setOutput("previous_tag", previousTag);
	setOutput("is_beta", String(isBeta));
	setOutput("raw_changelog_path", rawFile);
	setOutput("manifest_path", manifestFile);
	setOutput("context_path", contextFile);
}

export async function runReleaseNotes(
	operation: ReleaseNotesOperation,
	github?: GitHubReader,
): Promise<void> {
	switch (operation.type) {
		case "validate":
			return;
		case "candidate": {
			const versionCommit = findUnreleasedVersionCommit(
				operation.version,
				operation.branch,
			);
			setOutput("release", String(versionCommit !== null));
			setOutput("version", operation.version);
			if (versionCommit) setOutput("version_commit", versionCommit);
			return;
		}
		case "render":
			applyReleaseRewrites(
				operation.manifestPath,
				operation.rewritesPath,
				operation.outputPath,
			);
			return;
		case "rewrite":
			await rewriteReleaseNotes(operation.contextPath, operation.outputPath);
			return;
		case "collect":
			if (!github)
				throw new Error("GitHub reader is required to collect release notes");
			await collectReleaseNotes(
				github,
				operation.version,
				operation.branch,
				operation.dryRun,
				operation.commitRef,
			);
	}
}
