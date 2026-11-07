import type { Options, PromptObject } from "prompts";
import prompts from "prompts";
import { requireInteractive } from "./interactive";

/**
 * Asks on stderr, the stream the interactive check reads, so a redirected
 * stdout still shows the question and keeps only the command's result.
 *
 * `action` and `input` name what replaces the answer when the run can't prompt,
 * so every prompt states its non-interactive alternative.
 */
export function prompt(
	questions: PromptObject | PromptObject[],
	{
		action,
		input,
		onCancel,
	}: {
		action: string;
		input: string;
		onCancel?: Options["onCancel"];
	},
) {
	requireInteractive({
		action,
		input,
	});
	const toStderr = (question: PromptObject) => ({
		...question,
		stdout: process.stderr,
	});
	return prompts(
		Array.isArray(questions) ? questions.map(toStderr) : toStderr(questions),
		{ onCancel },
	);
}
