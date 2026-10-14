import { writeFileSync } from "node:fs";
import { setOutput } from "../actions-output.ts";
import { runGit } from "../git.ts";
import type { GitHubReader, GitHubRepository } from "../github.ts";
import {
	buildPackageMetadata,
	collectEntries,
	findPendingChangesets,
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
	| { type: "check-changesets"; branch: string }
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

interface ReleaseCollection {
	github?: GitHubReader;
	repository: GitHubRepository;
}

function buildRewriteContext(entries: ReleaseEntry[]): ReleaseRewriteContext {
	const context = new Map<string, ReleaseRewriteContext[string]>();
	for (const entry of entries) {
		const existing = context.get(entry.rewriteKey);
		if (existing) {
			if (!existing.packageNames.includes(entry.packageName)) {
				existing.packageNames.push(entry.packageName);
			}
			continue;
		}

		context.set(entry.rewriteKey, {
			title: entry.title,
			changesetDescription: entry.changesetDescription,
			prNumber: entry.prNumber,
			packageNames: [entry.packageName],
			changeType: entry.changeType,
		});
	}
	return Object.fromEntries(context);
}

async function collectReleaseNotes(
	collection: ReleaseCollection,
	version: string,
	branch: string,
	dryRun: boolean,
	commitRefOverride: string,
): Promise<void> {
	const { github, repository } = collection;
	const repositoryName = `${repository.owner}/${repository.repo}`;
	const isBeta = version.includes("-");
	const commitRef =
		commitRefOverride ||
		process.env.GITHUB_SHA ||
		runGit(["rev-parse", "HEAD"]).trim();
	const previousTag = findPreviousTag(version, isBeta, commitRef);

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
			repository: repositoryName,
			version,
			commitRef,
			entries,
			previousTag,
			packageMetadata: buildPackageMetadata(
				repositoryName,
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
	collection?: ReleaseCollection,
): Promise<void> {
	switch (operation.type) {
		case "validate":
			return;
		case "check-changesets": {
			const pending = findPendingChangesets(operation.branch);
			if (pending.length > 0) {
				throw new Error(
					`Release contains unconsumed changesets:\n${pending.join("\n")}`,
				);
			}
			return;
		}
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
			setOutput(
				"fallbacks",
				JSON.stringify(
					await rewriteReleaseNotes(
						operation.contextPath,
						operation.outputPath,
					),
				),
			);
			return;
		case "collect":
			if (!collection)
				throw new Error("Repository is required to collect release notes");
			await collectReleaseNotes(
				collection,
				operation.version,
				operation.branch,
				operation.dryRun,
				operation.commitRef,
			);
	}
}
