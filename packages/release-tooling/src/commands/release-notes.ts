import { resolve } from "node:path";
import { parseArgs as parseNodeArgs } from "node:util";
import { runCommand } from "../command.ts";
import { createGitHubReader, parseGitHubRepository } from "../github.ts";
import type { ReleaseNotesOperation } from "../release-notes/pipeline.ts";
import { runReleaseNotes } from "../release-notes/pipeline.ts";
import { parseSchema, releaseVersionSchema } from "../release-notes/schema.ts";

function parseOperation(): ReleaseNotesOperation {
	const { values, positionals } = parseNodeArgs({
		args: process.argv.slice(2),
		allowPositionals: true,
		strict: true,
		options: {
			version: { type: "string" },
			branch: { type: "string" },
			"dry-run": { type: "boolean", default: false },
			manifest: { type: "string" },
			rewrites: { type: "string" },
			context: { type: "string" },
			output: { type: "string" },
			"commit-ref": { type: "string" },
		},
	});
	const [command, ...extraPositionals] = positionals;
	if (
		command !== "validate" &&
		command !== "check-changesets" &&
		command !== "candidate" &&
		command !== "collect" &&
		command !== "rewrite" &&
		command !== "render"
	) {
		throw new Error(
			"Usage: release-notes <validate|check-changesets|candidate|collect|rewrite|render> [options]",
		);
	}
	if (extraPositionals.length > 0) {
		throw new Error(`Unexpected positional argument: ${extraPositionals[0]}`);
	}

	const version = values.version ?? "";
	const branch = values.branch ?? "";
	const dryRun = values["dry-run"] ?? false;
	const manifestPath = values.manifest ?? "";
	const rewritesPath = values.rewrites ?? "";
	const contextPath = values.context ?? "";
	const outputPath = values.output ?? "";
	const commitRef = values["commit-ref"] ?? "";

	if (command === "validate") {
		if (
			!version ||
			branch ||
			dryRun ||
			manifestPath ||
			rewritesPath ||
			contextPath ||
			outputPath ||
			commitRef
		) {
			throw new Error("Usage: release-notes validate --version <version>");
		}
		parseSchema(releaseVersionSchema, version, "Invalid version");
		return { type: "validate" };
	}

	if (command === "candidate") {
		if (
			!version ||
			!branch ||
			dryRun ||
			manifestPath ||
			rewritesPath ||
			contextPath ||
			outputPath ||
			commitRef
		) {
			throw new Error(
				"Usage: release-notes candidate --version <version> --branch <ref>",
			);
		}
		parseSchema(releaseVersionSchema, version, "Invalid version");
		return { type: "candidate", version, branch };
	}

	if (command === "check-changesets") {
		if (
			!branch ||
			version ||
			dryRun ||
			manifestPath ||
			rewritesPath ||
			contextPath ||
			outputPath ||
			commitRef
		) {
			throw new Error("Usage: release-notes check-changesets --branch <ref>");
		}
		return { type: "check-changesets", branch };
	}

	if (command === "rewrite") {
		if (
			!contextPath ||
			!outputPath ||
			version ||
			branch ||
			dryRun ||
			manifestPath ||
			rewritesPath ||
			commitRef
		) {
			throw new Error(
				"Usage: release-notes rewrite --context <path> --output <path>",
			);
		}
		return { type: "rewrite", contextPath, outputPath };
	}

	if (command === "render") {
		if (
			!manifestPath ||
			!rewritesPath ||
			!outputPath ||
			version ||
			branch ||
			dryRun ||
			contextPath ||
			commitRef
		) {
			throw new Error(
				"Usage: release-notes render --manifest <path> --rewrites <path> --output <path>",
			);
		}
		return { type: "render", manifestPath, rewritesPath, outputPath };
	}

	if (!version || manifestPath || rewritesPath || contextPath || outputPath) {
		throw new Error(
			"Usage: release-notes collect --version <version> [--branch <ref>] [--commit-ref <sha>] [--dry-run]",
		);
	}
	parseSchema(releaseVersionSchema, version, "Invalid version");
	return { type: "collect", version, branch, dryRun, commitRef };
}

const repositoryRoot =
	process.env.GITHUB_WORKSPACE ?? resolve(import.meta.dirname, "../../../..");
process.chdir(repositoryRoot);
await runCommand(() => {
	const operation = parseOperation();
	if (operation.type !== "collect") return runReleaseNotes(operation);

	const repository = process.env.GITHUB_REPOSITORY;
	if (!repository) throw new Error("GITHUB_REPOSITORY is required");
	const parsedRepository = parseGitHubRepository(repository);
	const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	const github = token
		? createGitHubReader({
				repository: parsedRepository,
				token,
				baseUrl: process.env.GITHUB_API_URL,
			})
		: undefined;
	return runReleaseNotes(operation, { repository: parsedRepository, github });
});
