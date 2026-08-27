import { readFileSync } from "node:fs";
import * as z from "zod";
import type { StructuredGenerator } from "../ai/generate-structured.ts";
import { generateStructured } from "../ai/generate-structured.ts";
import { containsUnsupportedGeneratedMarkdown } from "../ai/generated-copy.ts";
import { models } from "../ai/models.ts";

const changesetDescriptionSchema = z.strictObject({
	description: z
		.string()
		.trim()
		.min(1)
		.max(2_000)
		.refine((value) => value.split(/\s+/u).length <= 200, {
			error: "must contain at most 200 words",
		})
		.refine((value) => !value.includes("```"), {
			error: "must not contain fenced code blocks",
		})
		.refine(
			(value) => !value.toLowerCase().includes("<!-- auto-changeset -->"),
			{
				error: "must not contain workflow markers",
			},
		)
		.refine(
			(value) => !value.toLowerCase().includes("**commit this changeset**"),
			{
				error: "must not contain workflow controls",
			},
		)
		.refine(
			(value) => !containsUnsupportedGeneratedMarkdown(value, "description"),
			{
				error: "contains unsupported Markdown",
			},
		)
		.describe("A user-focused changeset description of at most 200 words"),
});

interface ChangesetRewriteContext {
	title: string;
	bump: "major" | "minor" | "patch";
	changedFiles: string[];
	cubicSummary: string;
	diff: string;
}

const instructions = readFileSync(
	new URL("./rewrite.prompt.md", import.meta.url),
	"utf-8",
);

export function createChangesetFallback(value: string): string {
	const result = changesetDescriptionSchema.safeParse({ description: value });
	return result.success
		? result.data.description
		: "Update user-facing package behavior.";
}

export async function rewriteChangesetDescription(
	context: ChangesetRewriteContext,
	generate: StructuredGenerator = generateStructured,
): Promise<string> {
	const output = await generate({
		model: models.changeset,
		name: "changeset_description",
		description: "A user-focused changeset description",
		instructions,
		prompt: JSON.stringify(context, null, 2),
		schema: changesetDescriptionSchema,
		maxOutputTokens: 1_200,
	});
	return output.description;
}
