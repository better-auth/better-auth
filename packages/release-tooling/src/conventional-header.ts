import createConventionalCommitsPreset from "conventional-changelog-conventionalcommits";
import type { ParserOptions } from "conventional-commits-parser";
import { CommitParser } from "conventional-commits-parser";

export interface ChangeHeader {
	type: string;
	scope: string;
	subject: string;
	breaking: boolean;
}

// SAFETY: The package returns parser options at runtime but declares its preset as {}.
const preset = createConventionalCommitsPreset() as { parser: ParserOptions };
const parser = new CommitParser(preset.parser);

export function parseConventionalHeader(header: string): ChangeHeader {
	const parsed = parser.parse(header);
	return {
		type: parsed.type ?? "",
		scope: parsed.scope ?? "",
		subject: parsed.subject ?? header.trim(),
		breaking: parsed.notes.length > 0,
	};
}
