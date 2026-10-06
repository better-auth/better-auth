import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs as parseNodeArgs } from "node:util";
import { runCommand } from "../command.ts";
import type { ReleaseNoteSource } from "../release-notes/comment.ts";
import {
	extractReleaseNotesComment,
	wrapReleaseNotesComment,
} from "../release-notes/comment.ts";
import type { ReleaseRewriteFallback } from "../release-notes/schema.ts";
import {
	parseSchema,
	releaseRewriteFallbacksSchema,
} from "../release-notes/schema.ts";

interface CommandArgs {
	mode: "wrap" | "extract";
	version: string;
	head: string;
	source: ReleaseNoteSource;
	fallbacks: ReleaseRewriteFallback[];
	inputPath: string;
	merged: boolean;
	outputPath: string;
}

function parseCommandArgs(): CommandArgs {
	const { values, positionals } = parseNodeArgs({
		args: process.argv.slice(2),
		allowPositionals: true,
		strict: true,
		options: {
			version: { type: "string" },
			head: { type: "string" },
			body: { type: "string" },
			comment: { type: "string" },
			merged: { type: "boolean", default: false },
			source: { type: "string" },
			fallbacks: { type: "string" },
			output: { type: "string" },
		},
	});
	const [mode, ...extraPositionals] = positionals;
	if (mode !== "wrap" && mode !== "extract") {
		throw new Error("First argument must be wrap or extract");
	}
	if (extraPositionals.length > 0) {
		throw new Error(`Unexpected positional argument: ${extraPositionals[0]}`);
	}

	const version = values.version ?? "";
	const head = values.head ?? "";
	const source = values.source ?? "ai";
	const merged = values.merged ?? false;
	const inputPath = mode === "wrap" ? values.body : values.comment;
	const unexpectedInput =
		mode === "wrap" ? values.comment !== undefined : values.body !== undefined;
	const outputPath = values.output ?? "";

	if (unexpectedInput) {
		throw new Error(
			mode === "wrap"
				? "wrap accepts --body, not --comment"
				: "extract accepts --comment, not --body",
		);
	}
	if (source !== "ai" && source !== "raw") {
		throw new Error("--source must be ai or raw");
	}
	if (mode === "extract" && values.source !== undefined) {
		throw new Error("extract does not accept --source");
	}
	if (mode === "extract" && values.fallbacks !== undefined) {
		throw new Error("extract does not accept --fallbacks");
	}
	if (mode === "extract" && merged) {
		throw new Error("extract does not accept --merged");
	}
	if (!version || !head || !inputPath || !outputPath) {
		throw new Error(
			"Usage: release-notes:comment <wrap|extract> --version <version> --head <sha> <--body|--comment> <path> --output <path> [--merged] [--fallbacks <json>]",
		);
	}

	const fallbacks =
		mode === "wrap"
			? parseSchema(
					releaseRewriteFallbacksSchema,
					JSON.parse(values.fallbacks ?? "[]"),
					"Invalid release-note fallbacks",
				)
			: [];

	return {
		mode,
		version,
		head,
		source,
		fallbacks,
		inputPath,
		merged,
		outputPath,
	};
}

function runReleaseNotesComment(): void {
	const args = parseCommandArgs();
	const input = readFileSync(args.inputPath, "utf-8");
	const output =
		args.mode === "wrap"
			? wrapReleaseNotesComment(args.version, args.head, input, {
					source: args.source,
					fallbacks: args.fallbacks,
					merged: args.merged,
				})
			: extractReleaseNotesComment(input, args.version, args.head);
	writeFileSync(args.outputPath, output);
}

await runCommand(runReleaseNotesComment);
