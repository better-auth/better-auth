import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs as parseNodeArgs } from "node:util";
import { runCommand } from "../command.ts";
import type { ReleaseNoteSource } from "../release-notes/comment.ts";
import {
	extractReleaseNotesComment,
	wrapReleaseNotesComment,
} from "../release-notes/comment.ts";

interface CommandArgs {
	mode: "wrap" | "extract";
	version: string;
	head: string;
	source: ReleaseNoteSource;
	inputPath: string;
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
			source: { type: "string" },
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
	if (!version || !head || !inputPath || !outputPath) {
		throw new Error(
			"Usage: release-notes:comment <wrap|extract> --version <version> --head <sha> <--body|--comment> <path> --output <path>",
		);
	}

	return { mode, version, head, source, inputPath, outputPath };
}

function runReleaseNotesComment(): void {
	const args = parseCommandArgs();
	const input = readFileSync(args.inputPath, "utf-8");
	const output =
		args.mode === "wrap"
			? wrapReleaseNotesComment(args.version, args.head, input, args.source)
			: extractReleaseNotesComment(input, args.version, args.head);
	writeFileSync(args.outputPath, output);
}

await runCommand(runReleaseNotesComment);
