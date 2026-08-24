import { readFileSync, writeFileSync } from "node:fs";
import type { StructuredGenerator } from "../ai/generate-structured.ts";
import { generateStructured } from "../ai/generate-structured.ts";
import { models } from "../ai/models.ts";
import type { ReleaseRewriteContext, ReleaseRewrites } from "./schema.ts";
import {
	parseSchema,
	releaseRewriteContextSchema,
	releaseRewritesSchema,
} from "./schema.ts";

const maxBatchEntries = 30;
const maxBatchCharacters = 60_000;
const maxContextCharacters = 500_000;
const maxOutputTokensPerBatch = 32_000;

const instructions = readFileSync(
	new URL("./rewrite.prompt.md", import.meta.url),
	"utf-8",
);

function buildBatches(context: ReleaseRewriteContext): ReleaseRewriteContext[] {
	const contextCharacters = JSON.stringify(context).length;
	if (contextCharacters > maxContextCharacters) {
		throw new Error(
			`Release rewrite context exceeds ${maxContextCharacters} characters`,
		);
	}

	const batches: ReleaseRewriteContext[] = [];
	let batch: ReleaseRewriteContext = {};
	let batchEntries = 0;
	let batchCharacters = 2;

	for (const [key, value] of Object.entries(context)) {
		const entryCharacters = JSON.stringify({ [key]: value }).length;
		if (entryCharacters + 2 > maxBatchCharacters) {
			throw new Error(
				`Release rewrite entry ${key} exceeds ${maxBatchCharacters} characters`,
			);
		}

		if (
			batchEntries > 0 &&
			(batchEntries >= maxBatchEntries ||
				batchCharacters + entryCharacters > maxBatchCharacters)
		) {
			batches.push(batch);
			batch = {};
			batchEntries = 0;
			batchCharacters = 2;
		}

		batch[key] = value;
		batchEntries += 1;
		batchCharacters += entryCharacters;
	}

	if (batchEntries > 0) batches.push(batch);
	return batches;
}

function mergeBatch(
	rewrites: ReleaseRewrites,
	batch: ReleaseRewriteContext,
	generated: ReleaseRewrites,
): void {
	const expectedKeys = Object.keys(batch).sort();
	const actualKeys = Object.keys(generated).sort();
	if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
		throw new Error(
			`AI rewrite batch keys did not match: expected ${expectedKeys.join(", ")}, received ${actualKeys.join(", ")}`,
		);
	}
	Object.assign(rewrites, generated);
}

export async function rewriteReleaseNotes(
	contextPath: string,
	outputPath: string,
	generate: StructuredGenerator = generateStructured,
): Promise<void> {
	const context = parseSchema(
		releaseRewriteContextSchema,
		JSON.parse(readFileSync(contextPath, "utf-8")),
		`Invalid release rewrite context ${contextPath}`,
	);
	const rewrites: ReleaseRewrites = {};
	for (const batch of buildBatches(context)) {
		const generated = await generate({
			model: models.releaseNotes,
			name: "release_note_rewrites",
			description:
				"User-focused release-note titles and migration instructions",
			instructions,
			prompt: JSON.stringify(batch, null, 2),
			schema: releaseRewritesSchema,
			maxOutputTokens: maxOutputTokensPerBatch,
		});
		mergeBatch(rewrites, batch, generated.rewrites);
	}

	writeFileSync(outputPath, JSON.stringify({ rewrites }, null, 2));
	console.log(`Wrote AI release-note rewrites to ${outputPath}`);
}
